package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository

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
