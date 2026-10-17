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
import java.time.Clock
import java.time.ZoneId
import java.util.UUID

/**
 * Which game the community is playing right now.
 *
 * The read path is a `SELECT`: [MaterialisationSchedule] has normally announced the round a day
 * ahead. Only a round the schedule missed is written here, by its first caller — which is why this
 * `GET` may still materialise. Were that row written on first reveal instead, the announcement
 * would have to be computed unpersisted beforehand and could differ from the row written later —
 * exactly the drift the frozen round exists to prevent.
 */
@Service
class AnnouncementService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val materialiser: RoundMaterialiser,
    private val responses: RoundResponses,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /**
     * Not `readOnly`: the first call of a round the schedule missed inserts. Every other call only
     * reads, which is where practically all traffic lands.
     */
    @Transactional
    fun currentRound(slug: String, userId: UUID, isSuperAdmin: Boolean): RoundResponse = responses.of(
        current = resolve(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin),
        viewerId = userId,
    )

    /**
     * The gate and the materialisation, shared by all four endpoints: membership, the run, the
     * window, then the announced round — created here if the schedule missed it and this is its
     * first caller.
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
            roundGame = existing ?: materialiser.materialise(edition = edition, roundNumber = round.number)
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
