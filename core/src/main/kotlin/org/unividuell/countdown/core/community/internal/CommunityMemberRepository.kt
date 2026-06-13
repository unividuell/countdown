package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.util.UUID

interface CommunityMemberRepository : CrudRepository<CommunityMember, UUID> {
    fun findByCommunityId(communityId: UUID): List<CommunityMember>
    fun findByCommunityIdAndUserId(communityId: UUID, userId: UUID): CommunityMember?

    fun countByCommunityIdAndStatus(communityId: UUID, status: MemberStatus): Long

    @Query("SELECT count(*) FROM community.community_members WHERE community_id = :cid AND status = 'ACTIVE' AND is_admin = true")
    fun countActiveAdmins(cid: UUID): Long

    @Query("SELECT * FROM community.community_members WHERE user_id = :uid AND status = 'ACTIVE'")
    fun findActiveByUserId(uid: UUID): List<CommunityMember>
}
