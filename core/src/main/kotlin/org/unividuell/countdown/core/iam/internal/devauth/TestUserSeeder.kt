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
     * Declaration order is the picker's render order. Rows are matched on provider "test" with the
     * login as subject, so a login once handed out is never renamed: every dev and staging database
     * already holds its row, and a new spelling would insert a duplicate beside it.
     */
    val seedUsers: List<SeedUser> = listOf(
        SeedUser("Fry", null, null, "🍕"),
        SeedUser("leela", "Leela", "Turanga Leela", "👁️"),
        SeedUser("Bender", null, null, "🤖"),
        SeedUser("prof", null, "Prof Farnsworth", "🔬"),
        SeedUser("amy", null, null, "💅"),
        SeedUser("hermes", null, "Hermes Conrad", "📋"),
        SeedUser("zoidberg", null, "Dr. Zoidberg", "🦞"),
        SeedUser("scruffy", null, "Scruffy", "🧹"),
        SeedUser("zapp", null, "Zapp Brannigan", "🎖️"),
        SeedUser("kif", null, "Kif Kroker", "😩"),
        SeedUser("nibbler", null, "Nibbler", "🐾"),
        SeedUser("mom", null, "Mom", "🏭"),
    )

    /** Single source of truth for accepted test logins; DevLoginController restricts `loginAs` to these. */
    val seedLogins: List<String> = seedUsers.map { it.login }

    /**
     * Mirrors `UserProvisioningService.sync`: identity fields and the allowlist flag are
     * authoritative and re-evaluated on every run, not just on insert — otherwise a seed row,
     * once drifted by hand, could never converge back to what `seedUsers` says. This matters
     * specifically for `githubLogin`: the picker joins on it (`DevLoginController`), so a stale
     * login would leave a row in the database that no button can ever reach.
     */
    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seedUsers.forEach { seed ->
            val isSuperAdmin = superAdminProperties.isSuperAdmin(seed.login)
            val existing = users.findByProviderAndSubject(provider = "test", subject = seed.login)
            if (existing == null) {
                users.save(
                    User(
                        provider = "test", subject = seed.login, githubLogin = seed.login,
                        githubName = seed.githubName, displayName = seed.displayName, isSuperAdmin = isSuperAdmin,
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
