package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

enum class MemberStatus { PENDING, ACTIVE }

@Table(schema = "community", name = "community_members")
data class CommunityMember(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    val userId: UUID,
    val status: MemberStatus,
    val isAdmin: Boolean = false,
    /** How this member appears in THIS community; null means the global profile applies. */
    val displayName: String? = null,
    val bgColorHex: String? = null,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
