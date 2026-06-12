package org.unividuell.countdown.core.iam

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.io.Serializable
import java.time.Instant
import java.util.UUID

@Table(schema = "iam", name = "users")
data class User(
    @Id
    val id: UUID? = null,
    val githubId: Long,
    val githubLogin: String,
    val githubName: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val bgColorHex: String? = null,
    val isSuperAdmin: Boolean = false,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
) : Serializable {
    /** Name shown in the UI: user-chosen, else GitHub display name, else GitHub handle. */
    val username: String
        get() = displayName ?: githubName ?: githubLogin
}
