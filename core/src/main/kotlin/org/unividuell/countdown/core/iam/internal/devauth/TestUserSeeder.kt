package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * One seeded Futurama test identity. [emoji] and [accentHex] are presentation-only — they exist so
 * the picker's twelve rows stay apart at a glance, and are never persisted.
 */
data class SeedUser(
    val login: String,
    val githubName: String?,
    val displayName: String?,
    val githubId: Long,
    val emoji: String,
    val accentHex: String,
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
        SeedUser("Fry", null, null, -1L, "🍕", "#ea580c"),
        SeedUser("leela", "Leela", "Turanga Leela", -2L, "👁️", "#7c3aed"),
        SeedUser("Bender", null, null, -3L, "🤖", "#64748b"),
        SeedUser("prof", null, "Prof Farnsworth", -4L, "🔬", "#0d9488"),
        SeedUser("amy", null, null, -5L, "💅", "#db2777"),
        SeedUser("hermes", null, "Hermes Conrad", -6L, "📋", "#15803d"),
        SeedUser("zoidberg", null, "Dr. Zoidberg", -7L, "🦞", "#dc2626"),
        SeedUser("scruffy", null, "Scruffy", -8L, "🧹", "#a16207"),
        SeedUser("zapp", null, "Zapp Brannigan", -9L, "🎖️", "#1d4ed8"),
        SeedUser("kif", null, "Kif Kroker", -10L, "😩", "#4d7c0f"),
        SeedUser("nibbler", null, "Nibbler", -11L, "🐾", "#0891b2"),
        SeedUser("mom", null, "Mom", -12L, "🏭", "#831843"),
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
