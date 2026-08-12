package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.Round
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
    private val responses: RoundResponses,
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
    fun currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse = responses.of(
        current = resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin),
        viewerId = userId,
    )

    /**
     * The gate and the materialisation, shared by all three endpoints: membership, the run, the
     * window, then the announced round — created here if this is the first caller of the round.
     */
    @Transactional
    fun resolve(slug: String, userId: UUID, isSuperAdmin: Boolean): CurrentRound {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return CurrentRound.NoGame(round = null, reason = NoGameReason.NOT_SCHEDULED)
        val startsAt = edition.startsAt
            ?: return CurrentRound.NoGame(round = null, reason = NoGameReason.NOT_SCHEDULED)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        windowReasonOf(
            roundNumber = round.number,
            gamesFromRound = edition.gamesFromRound,
            gamesUntilRound = edition.gamesUntilRound,
        )?.let { reason -> return CurrentRound.NoGame(round = round, reason = reason) }

        val existing = store.find(edition = edition, roundNumber = round.number)
        return announcedOrNoGame(
            edition = edition,
            round = round,
            roundGame = existing ?: materialise(edition = edition, round = round)
                ?: return CurrentRound.NoGame(round = round, reason = NoGameReason.NO_GAME_TYPE),
        )
    }

    private fun materialise(edition: CommunityEdition, round: Round): RoundGame? {
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = GameRandom.independent(secureRandom)
        val typeId = selection.pick(
            candidates = catalog.ids(),
            history = history,
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            random = random.presentation,
        ) ?: run {
            // Unreachable today, but not because Spring would refuse to inject an empty
            // List<GameType<*>> — it does that happily. It is unreachable because GuessHueGameType
            // is an unconditional bean, so the catalogue this branch guards against never empties.
            logger.warn { "no game type available for round ${round.number} of edition ${edition.id}" }
            return null
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        return store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = RoundContext(
                    roundNumber = round.number,
                    phase = Phase.of(edition = edition, roundNumber = round.number),
                ),
            ),
            award = awardFor(roundNumber = round.number, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
    }

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announcedOrNoGame(
        edition: CommunityEdition,
        round: Round,
        roundGame: RoundGame,
    ): CurrentRound {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            // The round was announced by a deployment that had a game this one does not. Nothing can
            // be played, but the round must not 500 — and the operator needs to know which type.
            logger.warn {
                "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for"
            }
            return CurrentRound.NoGame(round = round, reason = NoGameReason.NO_GAME_TYPE)
        }
        return CurrentRound.Announced(
            round = round,
            edition = edition,
            roundGame = roundGame,
            handle = handle,
        )
    }
}
