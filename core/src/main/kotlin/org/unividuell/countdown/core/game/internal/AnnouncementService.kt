package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
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
     * The gate and the materialisation, shared by all four endpoints: membership, the run, the
     * window, then the announced round — created here if this is the first caller of the round.
     */
    @Transactional
    fun resolve(slug: String, userId: UUID, isSuperAdmin: Boolean): ResolvedRound {
        val community = communities.findBySlug(slug) ?: throw RoundAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }
        val edition = communities.activeEditionOf(communityId)
            ?: return notScheduled(communityId = communityId, edition = null)
        val startsAt = edition.startsAt
            ?: return notScheduled(communityId = communityId, edition = edition)

        val round = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        // Computed for every answer, including the ones that carry no game: the history hangs under
        // the fallback too, and after the event that is the only reason to open the page.
        val previous = store.previousRound(edition = edition, roundNumber = round.number)
        windowReasonOf(edition = edition, roundNumber = round.number)?.let { reason ->
            return ResolvedRound.NoGame(
                communityId = communityId, edition = edition, round = round,
                previousRoundNumber = previous, reason = reason,
            )
        }

        val existing = store.find(edition = edition, roundNumber = round.number)
        return announcedOrNoGame(
            communityId = communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            roundGame = existing ?: materialise(edition = edition, round = round)
                ?: return ResolvedRound.NoGame(
                    communityId = communityId, edition = edition, round = round,
                    previousRoundNumber = previous, reason = NoGameReason.NO_GAME_TYPE,
                ),
        )
    }

    /** No run, or a run without a target date: no grid, so nothing can be previous to anything. */
    private fun notScheduled(communityId: UUID, edition: CommunityEdition?) = ResolvedRound.NoGame(
        communityId = communityId, edition = edition, round = null,
        previousRoundNumber = null, reason = NoGameReason.NOT_SCHEDULED,
    )

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
        val announced = store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = RoundContext(
                    roundNumber = round.number,
                    phase = Phase.of(edition = edition, roundNumber = round.number),
                    previousParams = store.previousParams(edition = edition, gameType = typeId),
                ),
            ),
            award = awardFor(roundNumber = round.number, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
        // On a lost announce race, `announced` is the WINNER's row, possibly of a different type
        // than `typeId` drew — so the hook must run against the type the persisted row actually
        // carries, not against this caller's `handle`. Both first callers reach this line and call
        // the winner's hook, which is exactly why it must be idempotent.
        val materialisedHandle = requireNotNull(catalog.handle(announced.gameType)) {
            "announced round carries unknown type '${announced.gameType}'"
        }
        materialisedHandle.materialised(params = announced.params, roundGameId = requireNotNull(announced.id))
        releaseEarlierRounds(edition = edition, current = round.number)
        return announced
    }

    /**
     * Only the current round is playable — past rounds are display-only and have no asset
     * endpoint — so whatever any game stored for earlier rounds may go. Every game is asked;
     * each deletes only what it owns (a no-op for most).
     */
    private fun releaseEarlierRounds(edition: CommunityEdition, current: Int) {
        val earlier = store.roundIdsExcept(edition = edition, roundNumber = current)
        if (earlier.isEmpty()) return
        for (id in catalog.ids()) {
            catalog.handle(id)?.releaseAssets(earlier)
        }
    }

    /**
     * Reads the game type off the stored row, not off the draw: on a lost race the row belongs to
     * whoever announced first, and their game is the one everybody plays.
     */
    private fun announcedOrNoGame(
        communityId: UUID,
        edition: CommunityEdition,
        round: Round,
        previousRoundNumber: Int?,
        roundGame: RoundGame,
    ): ResolvedRound {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            // The round was announced by a deployment that had a game this one does not. Nothing can
            // be played, but the round must not 500 — and the operator needs to know which type.
            logger.warn {
                "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for"
            }
            return ResolvedRound.NoGame(
                communityId = communityId, edition = edition, round = round,
                previousRoundNumber = previousRoundNumber, reason = NoGameReason.NO_GAME_TYPE,
            )
        }
        return ResolvedRound.Announced(
            communityId = communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previousRoundNumber,
            roundGame = roundGame,
            handle = handle,
            closed = false,
        )
    }
}
