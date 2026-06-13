package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

@Table(schema = "community", name = "communities")
data class Community(
    @Id
    val id: UUID? = null,
    val name: String,
    val slug: String,
    val startsAt: Instant? = null,
    val phaseTwoStartRound: Int? = null,
    val inviteToken: String? = null,
    val inviteTokenExpiresAt: Instant? = null,
    val createdBy: UUID,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
