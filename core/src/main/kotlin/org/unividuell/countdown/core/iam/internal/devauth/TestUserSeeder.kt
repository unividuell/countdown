package org.unividuell.countdown.core.iam.internal.devauth

import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

/** Seeds fixed Futurama test users for localhost + staging. Never in prod (profile + flag). */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class TestUserSeeder(private val users: UserRepository) : ApplicationRunner {
    // (github_login, github_name, display_name, synthetic negative github_id)
    private val seed = listOf(
        Triple("Fry", null as String?, null as String?) to -1L,
        Triple("leela", "Leela", "Turanga Leela") to -2L,
        Triple("Bender", null as String?, null as String?) to -3L,
        Triple("prof", null as String?, "Prof Farnsworth") to -4L,
        Triple("amy", null as String?, null as String?) to -5L,
    )

    override fun run(args: org.springframework.boot.ApplicationArguments) {
        seed.forEach { (t, id) ->
            if (users.findByGithubId(id) == null) {
                users.save(User(githubId = id, githubLogin = t.first, githubName = t.second, displayName = t.third))
            }
        }
    }
}
