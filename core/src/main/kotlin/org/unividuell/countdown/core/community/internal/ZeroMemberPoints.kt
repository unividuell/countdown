package org.unividuell.countdown.core.community.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import java.util.UUID

/** No games exist yet, so nobody has scored. Active whenever the stub is not. */
@Component
@ConditionalOnProperty(name = ["app.stub-points.enabled"], havingValue = "false", matchIfMissing = true)
class ZeroMemberPoints : MemberPointsQuery {
    override fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> =
        userIds.associateWith { MemberPoints(stable = 0, live = null) }
}
