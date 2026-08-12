package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
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
) {
    private val logger = KotlinLogging.logger {}

    /**
     * Idempotent: the first call writes the clock, every later one only counts up. No hard lockout —
     * Guess Hue has no time scoring, so a refresh buys a trickster nothing while a lockout would only
     * punish bad wifi. The threshold at which repeated reveals become a signal arrives with the first
     * time-scored game; inventing it now would mean inventing it without data.
     */
    @Transactional
    fun reveal(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        plays.revealOrCount(
            roundGameId = requireNotNull(current.roundGame.id),
            userId = userId,
            revealedAt = clock.instant(),
        )
        return responses.of(current = current, viewerId = userId)
    }

    @Transactional
    fun guess(slug: String, userId: UUID, isSuperAdmin: Boolean, guess: JsonNode): RoundResponse {
        val current = playable(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        // Locked first: the re-evaluation below reads and rewrites every guess of this round.
        val round = store.lock(current.roundGame)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id),
            userId = userId,
        ) ?: throw NotRevealedException()

        // judge() before any write: an invalid guess must not consume the one attempt.
        val judgement = current.handle.judge(params = round.params, guess = guess)
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = clock.instant(),
            qualifies = judgement.qualifies,
            deviation = judgement.deviation,
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

    /**
     * The same gate for both actions: resolved, inside the window, and carrying a playable game.
     *
     * Always resolved as a plain member, never as a super-admin. [AnnouncementService.resolve]'s
     * bypass exists so an admin may *look* without joining — a read. Revealing and guessing are
     * writes: `game.round_plays` carries no membership FK, and under `CLOSEST_ONLY` an outsider's
     * guess would move every real member's points to zero without ever showing up in the standings.
     * So [isSuperAdmin] never reaches [AnnouncementService] from here, unlike the announcement
     * endpoint, which still passes its own flag through unchanged.
     */
    private fun playable(slug: String, userId: UUID, isSuperAdmin: Boolean): CurrentRound.Announced =
        when (val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = false)) {
            is CurrentRound.Announced -> current
            is CurrentRound.NoGame -> throw NoGameToPlayException(current.reason)
        }
}
