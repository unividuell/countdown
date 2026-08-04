package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * One seeded Futurama test identity. [emoji] is presentation-only — it exists so the picker's twelve
 * rows stay apart at a glance, and is never persisted.
 */
data class SeedUser(
    val login: String,
    val githubName: String?,
    val displayName: String?,
    val githubId: Long,
    val emoji: String,
)

/** Seeds fixed Futurama test users for localhost + staging. Never in prod (profile + flag). */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class TestUserSeeder(
    private val users: UserRepository,
    private val superAdminProperties: SuperAdminProperties,
) : ApplicationRunner {
    /**
     * Declaration order is the picker's render order. The synthetic negative ids are what rows are
     * matched on, so an id already in use must never be reassigned: every dev and staging database
     * already holds the ids handed out so far, and moving one would orphan its row and insert a
     * duplicate beside it. A new character takes the next id counting down, never a freed one.
     */
    val seedUsers: List<SeedUser> = listOf(
        SeedUser("Fry", null, null, -1L, "🍕"),
        SeedUser("leela", "Leela", "Turanga Leela", -2L, "👁️"),
        SeedUser("Bender", null, null, -3L, "🤖"),
        SeedUser("prof", null, "Prof Farnsworth", -4L, "🔬"),
        SeedUser("amy", null, null, -5L, "💅"),
        SeedUser("hermes", null, "Hermes Conrad", -6L, "📋"),
        SeedUser("zoidberg", null, "Dr. Zoidberg", -7L, "🦞"),
        SeedUser("scruffy", null, "Scruffy", -8L, "🧹"),
        SeedUser("zapp", null, "Zapp Brannigan", -9L, "🎖️"),
        SeedUser("kif", null, "Kif Kroker", -10L, "😩"),
        SeedUser("nibbler", null, "Nibbler", -11L, "🐾"),
        SeedUser("mom", null, "Mom", -12L, "🏭"),
    )

    /** Single source of truth for accepted test logins; DevLoginController restricts `loginAs` to these. */
    val seedLogins: List<String> = seedUsers.map { it.login }

    /**
     * Mirrors `UserProvisioningService.sync`: identity fields and the allowlist flag are
     * authoritative and re-evaluated on every run, not just on insert — otherwise a seed row,
     * once drifted by hand (or by a past roster edit that renamed a login without moving its
     * pinned `githubId`), could never converge back to what `seedUsers` says. This matters
     * specifically for `githubLogin`: the picker joins on it (`DevLoginController`), so a stale
     * login would leave a row in the database that no button can ever reach.
     */
    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seedUsers.forEach { seed ->
            val isSuperAdmin = superAdminProperties.isSuperAdmin(seed.login)
            val existing = users.findByGithubId(seed.githubId)
            if (existing == null) {
                users.save(
                    User(
                        githubId = seed.githubId, githubLogin = seed.login, githubName = seed.githubName,
                        displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
                    )
                )
            } else if (existing.isSuperAdmin != isSuperAdmin ||
                existing.githubLogin != seed.login ||
                existing.githubName != seed.githubName ||
                existing.displayName != seed.displayName
            ) {
                users.save(
                    existing.copy(
                        githubLogin = seed.login, githubName = seed.githubName,
                        displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
                    )
                )
            }
        }
    }
}
