package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.iam.internal.devauth.TestUserSeeder

// default profile (not production) + the flag default true → seeder runs on context start.
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class TestUserSeederTest(@Autowired val users: UserRepository) {
    @Test
    fun `seeds twelve futurama test users, each on its pinned negative github id`() {
        val expected = mapOf(
            "Fry" to -1L, "leela" to -2L, "Bender" to -3L, "prof" to -4L, "amy" to -5L,
            "hermes" to -6L, "zoidberg" to -7L, "scruffy" to -8L, "zapp" to -9L,
            "kif" to -10L, "nibbler" to -11L, "mom" to -12L,
        )
        expected.forEach { (login, githubId) ->
            users.findByGithubLogin(login).shouldNotBeNull().githubId shouldBe githubId
        }
    }

    @Test
    fun `keeps seed rows that exercise all three username fallbacks`() {
        // displayName wins over githubName
        users.findByGithubLogin("leela").shouldNotBeNull().let {
            it.githubName shouldBe "Leela"
            it.displayName shouldBe "Turanga Leela"
            it.username shouldBe "Turanga Leela"
        }
        // no displayName, no githubName → the handle
        users.findByGithubLogin("Fry").shouldNotBeNull().let {
            it.githubName shouldBe null
            it.username shouldBe "Fry"
        }
        // displayName only
        users.findByGithubLogin("prof").shouldNotBeNull().username shouldBe "Prof Farnsworth"
    }
}

/** Separate context: this allowlist value must differ from every other seeder test's. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@TestPropertySource(properties = ["app.super-admin-github-logins=leela", "app.test-auth.enabled=true"])
class TestUserSeederAllowlistTest(@Autowired val users: UserRepository) {
    @Test
    fun `flags an allowlisted seed user on insert and leaves the others unflagged`() {
        users.findByGithubLogin("leela").shouldNotBeNull().isSuperAdmin shouldBe true
        users.findByGithubLogin("Fry").shouldNotBeNull().isSuperAdmin shouldBe false
    }
}

/** Separate context (distinct allowlist) so this test's manual flag flips don't race the above. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=prof", "app.test-auth.enabled=true"])
class TestUserSeederConvergenceTest(
    @Autowired val seeder: TestUserSeeder,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `re-running the seeder converges a drifted flag in both directions`() {
        // prof is allowlisted (flagged true by the startup run); flip it off by hand, e.g.
        // simulating a manual SQL UPDATE performed to test the feature before this fix existed.
        users.save(users.findByGithubLogin("prof").shouldNotBeNull().copy(isSuperAdmin = false))
        // Fry is NOT allowlisted (flagged false by the startup run); flip it on by hand.
        users.save(users.findByGithubLogin("Fry").shouldNotBeNull().copy(isSuperAdmin = true))

        seeder.run(DefaultApplicationArguments())

        users.findByGithubLogin("prof").shouldNotBeNull().isSuperAdmin shouldBe true
        users.findByGithubLogin("Fry").shouldNotBeNull().isSuperAdmin shouldBe false
    }
}
