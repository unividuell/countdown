package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.collections.shouldHaveSize
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
    fun `seeds the futurama test users with synthetic negative github ids`() {
        users.findByGithubLogin("leela").shouldNotBeNull().let {
            it.githubId shouldBe -2L
            it.githubName shouldBe "Leela"
            it.displayName shouldBe "Turanga Leela"
        }
        users.findByGithubLogin("Fry").shouldNotBeNull().githubId shouldBe -1L
        listOf("Fry", "leela", "Bender", "prof", "amy").forEach { users.findByGithubLogin(it).shouldNotBeNull() }
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
