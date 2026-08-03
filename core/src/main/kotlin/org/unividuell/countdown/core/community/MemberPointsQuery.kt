package org.unividuell.countdown.core.community

import java.util.UUID

/**
 * Game standings per member. The seam where real points will attach once the first mini-game exists;
 * today the only non-stub implementation returns zeroes.
 *
 * Viewer-scoped on purpose. The origin app revealed a member's points for the round in progress only
 * once the viewer had played that round themselves, and under the anti-cheat bar — the client must
 * never *materialise* what it should not have, not merely never display it — hiding them in the
 * frontend is not enough. So the decision is made here and the value simply is not returned.
 *
 * The interface lives in the consumer module; a future game module implements it. Deliberately
 * provisional: it costs nothing today and gets decided when there is a game, not before.
 */
interface MemberPointsQuery {
    fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints>
}

/** [live] is null both when the viewer may not see it and when the member has not played the round. */
data class MemberPoints(val stable: Int, val live: Int?)
