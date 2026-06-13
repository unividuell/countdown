package org.unividuell.countdown.core.community.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

@Table(schema = "community", name = "community_user_selection")
data class CommunityUserSelection(
    @Id
    val userId: UUID,
    val communityId: UUID,
    val updatedAt: Instant? = null,
)
