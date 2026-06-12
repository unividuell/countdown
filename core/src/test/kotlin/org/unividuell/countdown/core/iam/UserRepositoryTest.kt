package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserRepositoryTest(@Autowired val repository: UserRepository) {

    @Test
    fun `saves a new user and assigns a uuid v7 id`() {
        val saved = repository.save(
            User(githubId = 4711L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        assertNotNull(saved.id, "DB should assign a UUID v7")
        assertEquals(7, saved.id!!.version(), "id must be a UUID version 7")
        assertNotNull(saved.createdAt)
        assertNotNull(saved.updatedAt)
    }

    @Test
    fun `finds a user by github id`() {
        repository.save(User(githubId = 1234L, githubLogin = "hubert", githubName = null, email = null))

        val found = repository.findByGithubId(1234L)

        assertNotNull(found)
        assertEquals("hubert", found.githubLogin)
        assertNull(repository.findByGithubId(9999L))
    }
}
