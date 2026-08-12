package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.rng.SeededRandom
import java.security.SecureRandom
import java.time.Clock
import java.time.ZoneId
import java.util.UUID

/**
 * Which game the community is playing right now.
 *
 * The read path is a `SELECT`; only the first caller of a round writes. That is why this is a `GET`
 * that materialises: the announcement **is** the materialisation. Were the row written on first
 * reveal instead, the announcement would have to be computed unpersisted beforehand and could differ
 * from the row written later — exactly the drift the frozen round exists to prevent.
 */
@Service
class AnnouncementService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val selection: GameSelection,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** The hidden seed is drawn, never derived: `(edition, round)` would be guessable. */
    private val secureRandom = SecureRandom()

    /**
     * Not `readOnly`: the first call of a round inserts. Every later call of the same round only
     * reads, which is where practically all traffic lands.
     */
    @Transactional
    fun currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return noGame(round = null, reason = NoGameReason.NOT_SCHEDULED)
        val startsAt = edition.startsAt
            ?: return noGame(round = null, reason = NoGameReason.NOT_SCHEDULED)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        windowReasonOf(
            roundNumber = round.number,
            gamesFromRound = edition.gamesFromRound,
            gamesUntilRound = edition.gamesUntilRound,
        )?.let { reason -> return noGame(round = round, reason = reason) }

        val existing = store.find(edition = edition, roundNumber = round.number)
        if (existing != null) return announced(round = round, roundGame = existing)

        return materialise(edition = edition, round = round)
    }

    private fun materialise(edition: CommunityEdition, round: Round): RoundResponse {
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = SeededRandom.fromSeed(secureRandom.nextInt())
        val typeId = selection.pick(
            candidates = catalog.ids(),
            history = history,
            random = random,
        ) ?: run {
            // Unreachable today, but not because Spring would refuse to inject an empty
            // List<GameType<*>> — it does that happily. It is unreachable because GuessHueGameType
            // is an unconditional bean, so the catalogue this branch guards against never empties.
            logger.warn { "no game type available for round ${round.number} of edition ${edition.id}" }
            return noGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val params = handle.draw(
            random = random,
            context = RoundContext(
                roundNumber = round.number,
                phase = Phase.of(edition = edition, roundNumber = round.number),
            ),
        )
        val announced = store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = params,
            award = awardFor(
                roundNumber = round.number,
                phaseTwoStartRound = edition.phaseTwoStartRound,
            ),
            announcedAt = clock.instant(),
        )
        return announced(round = round, roundGame = announced)
    }

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announced(round: Round, roundGame: RoundGame): RoundResponse {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            // The round was announced by a deployment that had a game this one does not. Nothing can
            // be played, but the round must not 500 — and the operator needs to know which type.
            logger.warn { "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for" }
            return noGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        return RoundResponse(
            round = round.toDto(),
            game = GameDto(id = handle.id, displayName = handle.displayName),
            noGameReason = null,
        )
    }

    private fun noGame(round: Round?, reason: NoGameReason) =
        RoundResponse(round = round?.toDto(), game = null, noGameReason = reason)
}
