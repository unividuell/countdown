package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.RoleAllowlist
import org.unividuell.auth.RoleMember
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

/**
 * A super-admin as seen from both sources: `flagged` is the `is_super_admin` column,
 * `allowlisted` is membership in `unividuell.auth.roles.super-admin`. `username`, `userId` and
 * `createdAt` are null for an allowlist entry that has never logged in.
 */
data class SuperAdminUserResponse(
    val provider: String,
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
 * A row is one provider plus one lowercased login: `github:prof` and `test:prof` are two people.
 */
@Service
class SuperAdminRosterService(
    private val users: UserRepository,
    private val roles: RoleAllowlist,
) {
    @Transactional(readOnly = true)
    fun roster(): List<SuperAdminUserResponse> {
        // RoleAllowlist hands its entries over trimmed, lowercased and without blanks.
        val allowlist = roles.members("SUPER_ADMIN").toSet()

        val flagged = users.findSuperAdmins()
        // One query per provider, each with a non-empty list: `IN ()` is a SQL syntax error.
        val allowlisted = allowlist
            .groupBy(keySelector = { it.provider }, valueTransform = { it.login })
            .flatMap { (provider, logins) ->
                users.findByProviderAndGithubLoginLowercaseIn(provider = provider, logins = logins)
            }

        val byMember = (flagged + allowlisted).associateBy { it.member() }
        val withoutUserRow = allowlist - byMember.keys

        return (
            byMember.map { (member, user) -> user.toRow(allowlisted = member in allowlist) } +
                withoutUserRow.map {
                    SuperAdminUserResponse(
                        provider = it.provider, githubLogin = it.login, username = null, userId = null,
                        flagged = false, allowlisted = true, createdAt = null,
                    )
                }
            ).sortedWith(compareBy<SuperAdminUserResponse>({ it.githubLogin.lowercase() }, { it.provider }))
    }

    /** This row in the allowlist's terms: provider and login, both lowercase. */
    private fun User.member() = RoleMember(provider = provider.lowercase(), login = githubLogin.lowercase())

    private fun User.toRow(allowlisted: Boolean) = SuperAdminUserResponse(
        provider = provider,
        githubLogin = githubLogin,
        username = username,
        userId = id,
        flagged = isSuperAdmin,
        allowlisted = allowlisted,
        createdAt = createdAt,
    )
}
