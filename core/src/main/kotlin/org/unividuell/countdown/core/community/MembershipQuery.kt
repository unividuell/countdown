package org.unividuell.countdown.core.community

import java.util.UUID

interface MembershipQuery {
    fun isActiveMember(communityId: UUID, userId: UUID): Boolean
    fun isAdmin(communityId: UUID, userId: UUID): Boolean
    fun activeCommunitiesOf(userId: UUID): List<Community>
}
