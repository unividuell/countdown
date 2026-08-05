package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * Rows carry the raw `community_creation_allowed`, never the effective permission: the toggle in
 * the UI has to show what is stored. A super-admin may create communities regardless, which the
 * `isSuperAdmin` field lets the caller render instead of conflating the two.
 */
data class SuperAdminUserListEntry(
    val userId: UUID,
    val username: String,
    val githubLogin: String,
    val isSuperAdmin: Boolean,
    val communityCreationAllowed: Boolean,
    val createdAt: Instant?,
)

data class SuperAdminUserDetail(
    val userId: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val displayName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean,
    val communityCreationAllowed: Boolean,
    val createdAt: Instant?,
    val updatedAt: Instant?,
)

@Service
class SuperAdminUserService(private val users: UserRepository) {

    @Transactional(readOnly = true)
    fun list(): List<SuperAdminUserListEntry> =
        users.findAll().map { it.toListEntry() }.sortedBy { it.username.lowercase() }

    @Transactional(readOnly = true)
    fun detail(id: UUID): SuperAdminUserDetail = load(id).toDetail()

    /**
     * Idempotent: setting the clearance a user already has returns the current state without an
     * UPDATE, so a repeated PUT does not churn `updated_at`.
     */
    @Transactional
    fun setCommunityCreation(id: UUID, allowed: Boolean): SuperAdminUserDetail {
        val user = load(id)
        if (user.communityCreationAllowed == allowed) return user.toDetail()
        return users.save(
            user.copy(communityCreationAllowed = allowed, updatedAt = Instant.now())
        ).toDetail()
    }

    private fun load(id: UUID): User =
        users.findByIdOrNull(id) ?: throw UserNotFoundException("user $id not found")

    private fun User.toListEntry() = SuperAdminUserListEntry(
        userId = id!!, username = username, githubLogin = githubLogin,
        isSuperAdmin = isSuperAdmin, communityCreationAllowed = communityCreationAllowed,
        createdAt = createdAt,
    )

    private fun User.toDetail() = SuperAdminUserDetail(
        userId = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
        displayName = displayName, email = email, bgColorHex = bgColorHex,
        isSuperAdmin = isSuperAdmin, communityCreationAllowed = communityCreationAllowed,
        createdAt = createdAt, updatedAt = updatedAt,
    )
}
