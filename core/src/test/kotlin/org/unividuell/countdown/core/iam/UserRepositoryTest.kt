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
            User(githubId = 4711L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        saved.id.shouldNotBeNull()
        saved.id!!.version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        saved.updatedAt.shouldNotBeNull()
    }

    @Test
    fun `finds a user by github id`() {
        repository.save(User(githubId = 1234L, githubLogin = "hubert", githubName = null, email = null))

        val found = repository.findByGithubId(1234L)

        found.shouldNotBeNull()
        found.githubLogin shouldBe "hubert"
        repository.findByGithubId(9999L).shouldBeNull()
    }
}
