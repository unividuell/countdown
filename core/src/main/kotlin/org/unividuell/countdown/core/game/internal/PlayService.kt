package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.game.GuessAction
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.SOLUTION_ASSET_KEY
import org.unividuell.countdown.core.game.guessActionFor
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.UUID

/**
 * Playing the current round: reveal, then guess. **Only the running round is playable** — whoever
 * missed a round has zero points for it, and past rounds are display only.
 */
@Service
class PlayService(
    private val announcements: AnnouncementService,
    private val store: RoundGameStore,
    private val plays: RoundPlayRepository,
    private val scoring: RoundScoring,
    private val responses: RoundResponses,
    private val mapper: ObjectMapper,
    private val clock: Clock,
    private val history: HistoryService,
) {
    private val logger = KotlinLogging.logger {}

    /**
     * Which statement runs depends on the game: `GameType.requiresReveal` decides.
     *
     * A game that requires a deliberate reveal gets exactly one — the second attempt is a 409. A game
     * that does not stays idempotent: the first call writes the clock, every later one only counts up.
     * No hard lockout there — Guess Hue has no time scoring, so a refresh buys a trickster nothing
     * while a lockout would only punish bad wifi. The threshold at which repeated reveals become a
     * signal arrives with the first time-scored game; inventing it now would mean inventing it
     * without data.
     */
    @Transactional
    fun reveal(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        val roundGameId = requireNotNull(current.roundGame.id)
        val revealedAt = clock.instant()
        if (current.handle.requiresReveal(current.roundGame.params)) {
            // Exactly once, decided by the statement rather than by a check — see revealOnce().
            val opened = plays.revealOnce(
                roundGameId = roundGameId, userId = userId, revealedAt = revealedAt,
            )
            if (opened == 0) throw AlreadyRevealedException()
        } else {
            // Idempotent, no lockout: this game does not score on time, so a refresh is free. The
            // counter still records that somebody looked again.
            plays.revealOrCount(
                roundGameId = roundGameId, userId = userId, revealedAt = revealedAt,
            )
        }
        return responses.of(current = current, viewerId = userId)
    }

    @Transactional
    fun guess(
        slug: String,
        userId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        guess: JsonNode,
    ): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        // Checked before the lock and before judging: a guess meant for another round must not touch
        // this one at all.
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        // Locked first: the re-evaluation below reads and rewrites every guess of this round.
        val round = store.lock(current.roundGame)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id),
            userId = userId,
        ) ?: throw NotRevealedException()

        // judge() before any write: an invalid guess must not consume the one attempt.
        val judgement = current.handle.judge(params = round.params, guess = guess)
        val stages = current.handle.stages(round.params)
        val action = guessActionFor(
            rule = round.awardRule,
            qualifies = judgement.qualifies,
            stage = play.stage,
            stages = stages,
        )
        if (action == GuessAction.ADVANCE_STAGE) {
            // Judged and discarded on purpose: in phase one a wrong guess below the last stage only
            // burns the stage. The terminal write below stays the only guess the row ever keeps.
            val advanced = plays.advanceStage(
                roundGameId = requireNotNull(round.id), userId = userId, expectedStage = play.stage,
            )
            if (advanced == 0) throw StageMovedOnException()
            return responses.of(current = current.copy(roundGame = round), viewerId = userId)
        }
        // For a staged game the distance IS the stage — framework state the game cannot know. A
        // single-stage game keeps the game's own distance.
        val deviation = if (stages > 1) play.stage.toDouble() else judgement.deviation
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = clock.instant(),
            qualifies = judgement.qualifies,
            deviation = deviation,
            // Stored as the game shaped it — the framework never looks inside.
            outcome = judgement.outcome?.let { mapper.valueToTree(it) },
        )
        // Zero rows means guessed_at was already set. "One guess per round" is this UPDATE, not a
        // read-then-check.
        if (recorded == 0) throw AlreadyGuessedException()

        val written = scoring.reevaluate(round)
        logger.debug { "round ${round.roundNumber}: guess by $userId rewrote $written rows" }
        return responses.of(current = current.copy(roundGame = round), viewerId = userId)
    }

    /** Voluntary stage advance. Own row only — no round lock needed, the guard is the statement. */
    @Transactional
    fun skip(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, fromStage: Int): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        val stages = current.handle.stages(current.roundGame.params)
        // No skip off the top: the exits up there are the terminal guess, or giving up.
        if (fromStage < 0 || fromStage >= stages - 1) throw StageMovedOnException()
        val roundGameId = requireNotNull(current.roundGame.id)
        val advanced = plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = fromStage)
        if (advanced == 0) {
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
                ?: throw NotRevealedException()
            throw StageMovedOnException()
        }
        return responses.of(current = current, viewerId = userId)
    }

    /** The explicit exit without an answer: spends the guess, scores 0, opens the solution gate. */
    @Transactional
    fun giveUp(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (current.round.number != roundNumber) throw RoundMovedOnException(current.round.number)
        // Locked like a guess: the re-evaluation below reads and rewrites every guess of this round.
        val round = store.lock(current.roundGame)
        val roundGameId = requireNotNull(round.id)
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
            ?: throw NotRevealedException()
        val spent = plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant())
        if (spent == 0) throw AlreadyGuessedException()
        scoring.reevaluate(round)
        return responses.of(current = current.copy(roundGame = round), viewerId = userId)
    }

    /**
     * One stored asset of a round.
     *
     * Two gates behind one URL, chosen by the number: the running round keeps the stage gate
     * (unlocked stages, the solution key with the spent guess), a closed round is open — nothing
     * gates a round nobody can play any more, and its reveal shows the solution anyway.
     *
     * Resolved with the caller's own super-admin flag, unlike [playable]: fetching bytes is a read,
     * and the read bypass exists so an admin may look without joining. Consequence: an admin
     * without a membership row now gets a 409 on the RUNNING round's asset (no play row) rather
     * than a 404 (no membership) — the more honest of the two.
     *
     * Not `readOnly`: like [AnnouncementService.currentRound], the first fetch of an un-materialised
     * round inserts.
     */
    @Transactional
    fun asset(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, key: Int): RoundAsset {
        val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        // A larger number is earlier: anything above the running round is history.
        if (roundNumber > currentNumber) {
            val closed = history.resolve(current = current, roundNumber = roundNumber)
            if (closed !is ResolvedRound.Announced) throw AssetNotFoundException()
            return closed.handle.asset(
                params = closed.roundGame.params,
                roundGameId = requireNotNull(closed.roundGame.id),
                key = key,
            ) ?: throw AssetNotFoundException()
        }
        if (roundNumber < currentNumber) throw RoundNotFoundException()
        // Smart-cast, no explicit cast: `ResolvedRound` has exactly two cases.
        val announced = when (current) {
            is ResolvedRound.NoGame -> throw NoGameToPlayException(current.reason)
            is ResolvedRound.Announced -> current
        }
        val roundGameId = requireNotNull(announced.roundGame.id)
        val play = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)
            ?: throw NotRevealedException()
        val allowed = if (key == SOLUTION_ASSET_KEY) play.guessedAt != null else key in 0..play.stage
        if (!allowed) throw AssetForbiddenException()
        return announced.handle.asset(params = announced.roundGame.params, roundGameId = roundGameId, key = key)
            ?: throw AssetNotFoundException()
    }

    /**
     * The same gate for every action: resolved, inside the window, and carrying a playable game.
     *
     * Always resolved as a plain member, never as a super-admin. [AnnouncementService.resolve]'s
     * bypass exists so an admin may *look* without joining — a read. Revealing, guessing, skipping
     * and giving up are all writes: `game.round_plays` carries no membership FK, and under
     * `CLOSEST_ONLY` an outsider's guess would move every real member's points to zero without ever
     * showing up in the standings.
     * So [isSuperAdmin] never reaches [AnnouncementService] from here, unlike the announcement
     * endpoint, which still passes its own flag through unchanged.
     */
    private fun playable(slug: String, userId: UUID, isSuperAdmin: Boolean): ResolvedRound.Announced =
        when (val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = false)) {
            is ResolvedRound.Announced -> current
            is ResolvedRound.NoGame -> throw NoGameToPlayException(current.reason)
        }
}
