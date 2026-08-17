package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

@Service
class MemberIdentityService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
) : MemberIdentityQuery {

    override fun of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity> {
        val ids = userIds.distinct()
        if (ids.isEmpty()) return emptyMap()
        val rows = members.findByCommunityId(communityId).associateBy { it.userId }
        return users.findAllById(ids).mapNotNull { user ->
            val id = user.id ?: return@mapNotNull null
            val row = rows[id]
            id to MemberIdentityResolver.resolve(
                user = user,
                displayName = row?.displayName,
                bgColorHex = row?.bgColorHex,
            )
        }.toMap()
    }

    override fun of(communityId: UUID, userId: UUID): MemberIdentity? =
        of(communityId = communityId, userIds = listOf(userId))[userId]
}
