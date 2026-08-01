package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * A super-admin as seen from both sources: `flagged` is the `is_super_admin` column,
 * `allowlisted` is membership in `app.super-admin-github-logins`. `username`, `userId` and
 * `createdAt` are null for an allowlist entry that has never logged in.
 */
data class SuperAdminUserResponse(
    val githubLogin: String,
    val username: String?,
    val userId: UUID?,
    val flagged: Boolean,
    val allowlisted: Boolean,
    val createdAt: Instant?,
)

/**
 * Who holds super-admin rights, from both sources — they drift by design. `is_super_admin` is
 * re-derived from the allowlist on every login, so someone newly allowlisted has no flag yet and
 * someone removed keeps it until their next sign-in. Reporting only one source would hide exactly
 * the state this endpoint exists to show, so rows carry both raw facts and the caller labels them.
 */
@Service
class SuperAdminRosterService(
    private val users: UserRepository,
    private val properties: SuperAdminProperties,
) {
    @Transactional(readOnly = true)
    fun roster(): List<SuperAdminUserResponse> {
        // Blanks (from a trailing/double comma, or the empty env default) and stray whitespace
        // (from "a, b") are already stripped by SuperAdminProperties.normalizedSuperAdminGithubLogins.
        // Doing that before the emptiness check below is what makes `IN ()` unreachable: that
        // check only ever sees the already-cleaned set.
        val allowlist = properties.normalizedSuperAdminGithubLogins
            .map { it.lowercase() }
            .toSet()

        val flagged = users.findSuperAdmins()
        val allowlisted =
            if (allowlist.isEmpty()) emptyList() else users.findByGithubLoginLowercaseIn(allowlist)

        val byLogin = (flagged + allowlisted).associateBy { it.githubLogin.lowercase() }
        val withoutUserRow = allowlist - byLogin.keys

        return (
            byLogin.map { (login, user) -> user.toRow(allowlisted = login in allowlist) } +
                withoutUserRow.map {
                    SuperAdminUserResponse(
                        githubLogin = it, username = null, userId = null,
                        flagged = false, allowlisted = true, createdAt = null,
                    )
                }
            ).sortedBy { it.githubLogin.lowercase() }
    }

    private fun User.toRow(allowlisted: Boolean) = SuperAdminUserResponse(
        githubLogin = githubLogin,
        username = username,
        userId = id,
        flagged = isSuperAdmin,
        allowlisted = allowlisted,
        createdAt = createdAt,
    )
}
