package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import java.util.UUID

/** No games exist yet, so nobody has scored. */
class ZeroMemberPoints : MemberPointsQuery {
    override fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> =
        userIds.associateWith { MemberPoints(stable = 0, live = null) }
}
