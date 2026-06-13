package org.unividuell.countdown.core.community.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

@Service
@Transactional(readOnly = true)
class CommunityQueryService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) : CommunityQuery, MembershipQuery {
    override fun findBySlug(slug: String): Community? = communities.findBySlug(slug)
    override fun findById(id: UUID): Community? = communities.findByIdOrNull(id)

    override fun isActiveMember(communityId: UUID, userId: UUID): Boolean =
        members.findByCommunityIdAndUserId(communityId, userId)?.status == MemberStatus.ACTIVE

    override fun isAdmin(communityId: UUID, userId: UUID): Boolean =
        members.findByCommunityIdAndUserId(communityId, userId)
            ?.let { it.status == MemberStatus.ACTIVE && it.isAdmin } ?: false

    override fun activeCommunitiesOf(userId: UUID): List<Community> =
        members.findActiveByUserId(userId).mapNotNull { communities.findByIdOrNull(it.communityId) }
}
