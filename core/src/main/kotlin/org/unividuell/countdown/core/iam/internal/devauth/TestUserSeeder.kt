package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserRepository

/** Seeds fixed Futurama test users for localhost + staging. Never in prod (profile + flag). */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class TestUserSeeder(
    private val users: UserRepository,
    private val superAdminProperties: SuperAdminProperties,
) : ApplicationRunner {
    // (github_login, github_name, display_name, synthetic negative github_id)
    private val seed = listOf(
        Triple("Fry", null as String?, null as String?) to -1L,
        Triple("leela", "Leela", "Turanga Leela") to -2L,
        Triple("Bender", null as String?, null as String?) to -3L,
        Triple("prof", null as String?, "Prof Farnsworth") to -4L,
        Triple("amy", null as String?, null as String?) to -5L,
    )

    /** Single source of truth for accepted test logins; DevLoginController restricts `loginAs` to these. */
    val seedLogins: List<String> = seed.map { (t, _) -> t.first }

    /**
     * Mirrors `UserProvisioningService.sync`: the allowlist is authoritative and re-evaluated on
     * every run, not just on insert — otherwise a seed user's flag, once set by hand, could never
     * converge back to what the allowlist says (nor could a newly-allowlisted seed login ever
     * pick up the role, since this runner only ever inserted before).
     */
    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seed.forEach { (t, id) ->
            val isSuperAdmin = superAdminProperties.isSuperAdmin(t.first)
            val existing = users.findByGithubId(id)
            if (existing == null) {
                users.save(
                    User(
                        githubId = id, githubLogin = t.first, githubName = t.second, displayName = t.third,
                        isSuperAdmin = isSuperAdmin,
                    )
                )
            } else if (existing.isSuperAdmin != isSuperAdmin) {
                users.save(existing.copy(isSuperAdmin = isSuperAdmin))
            }
        }
    }
}
