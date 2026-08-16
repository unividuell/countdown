package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock
import java.time.ZoneId
import java.util.UUID

/**
 * The real standings: a sum over the frozen `points` of the active run.
 *
 * `stable` counts rounds that are **finished** *and* **inside the run's current game window**. The
 * window belongs to the admin, so shrinking it lets a total drop — that follows from the rule and is
 * not an effect to design away. It is also reversible: the points sit frozen on the row and only
 * their *inclusion* in the sum is dynamic, so a re-opened window brings the same numbers back with no
 * recalculation. That is the same property that makes `points` a cache over persisted inputs rather
 * than a verdict.
 *
 * `live` is the running round, and only for a viewer who has guessed it themselves — the origin app's
 * rule, and it is decided here rather than in the client, because the client must never *materialise*
 * what it may not have.
 *
 * The only `MemberPointsQuery` there is. It answers `0` for a community without played rounds all by
 * itself, which is why no environment needs a stand-in implementation.
 */
@Component
class RoundPlayPoints(
    private val plays: RoundPlayRepository,
    private val communities: CommunityQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : MemberPointsQuery {

    override fun standings(
        communityId: UUID,
        viewerId: UUID,
        userIds: Collection<UUID>,
    ): Map<UUID, MemberPoints> {
        // `IN ()` is a syntax error, and there is nothing to sum for nobody.
        if (userIds.isEmpty()) return emptyMap()
        val blank = userIds.associateWith { MemberPoints(stable = 0, live = null) }
        val edition = communities.activeEditionOf(communityId) ?: return blank
        val startsAt = edition.startsAt ?: return blank

        val current = engine.roundAt(
            now = clock.instant(),
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        val scored = plays.pointsOf(
            editionId = requireNotNull(edition.id),
            // The viewer joins the query even when they are not on this roster — a super-admin
            // looking in: the live gate asks whether *they* guessed, not whether they are ranked.
            userIds = (userIds + viewerId).distinct(),
        ).filter { windowReasonOf(edition = edition, roundNumber = it.roundNumber) == null }

        // A larger round number is earlier in time, so "finished" is `> current`.
        val stable = scored.filter { it.roundNumber > current }
            .groupBy { it.userId }
            .mapValues { (_, rounds) -> rounds.sumOf { it.points } }
        val running = scored.filter { it.roundNumber == current }
        val live = if (running.any { it.userId == viewerId }) {
            running.associate { it.userId to it.points }
        } else {
            emptyMap()
        }

        return userIds.associateWith { MemberPoints(stable = stable[it] ?: 0, live = live[it]) }
    }
}
