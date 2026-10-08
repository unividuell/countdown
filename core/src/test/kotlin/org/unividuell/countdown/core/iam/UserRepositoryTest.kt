package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserRepositoryTest(@Autowired val repository: UserRepository) {

    @Test
    fun `saves a new user and assigns a uuid v7 id`() {
        val saved = repository.save(
            User(subject = "4711", githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        saved.id.shouldNotBeNull().version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        saved.updatedAt.shouldNotBeNull()
    }

    @Test
    fun `finds a user by provider and subject`() {
        repository.save(User(subject = "1234", githubLogin = "hubert", githubName = null, email = null))

        val found = repository.findByProviderAndSubject(provider = "github", subject = "1234")

        found.shouldNotBeNull()
        found.githubLogin shouldBe "hubert"
        repository.findByProviderAndSubject(provider = "github", subject = "9999").shouldBeNull()
    }

    @Test
    fun `the same subject at another provider is another user`() {
        repository.save(User(provider = "github", subject = "77", githubLogin = "octo-77"))
        repository.save(User(provider = "test", subject = "77", githubLogin = "test-77"))

        repository.findByProviderAndSubject(provider = "test", subject = "77").shouldNotBeNull()
            .githubLogin shouldBe "test-77"
    }

    @Test
    fun `stores no community-creation clearance by default and round-trips it`() {
        val saved = repository.save(User(subject = "5150", githubLogin = "newcomer"))
        saved.communityCreationAllowed shouldBe false

        val cleared = repository.save(saved.copy(communityCreationAllowed = true))

        repository.findByProviderAndSubject(provider = "github", subject = "5150")!!.communityCreationAllowed shouldBe true
        cleared.mayCreateCommunities shouldBe true
    }
}
