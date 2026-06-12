package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProfileService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserProfileServiceTest(
    @Autowired val service: UserProfileService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `updates user-owned fields and preserves github fields`() {
        val saved = repository.save(User(githubId = 200L, githubLogin = "octocat", githubName = "The Octocat"))

        val updated = service.update(saved.id!!, displayName = "Mr. Custom", bgColorHex = "#00ff00")

        assertEquals("Mr. Custom", updated.displayName)
        assertEquals("#00ff00", updated.bgColorHex)
        assertEquals("octocat", updated.githubLogin)
        assertEquals("The Octocat", updated.githubName)
    }

    @Test
    fun `null clears a user-owned field`() {
        val saved = repository.save(
            User(githubId = 201L, githubLogin = "octocat", displayName = "old", bgColorHex = "#111111")
        )

        val updated = service.update(saved.id!!, displayName = null, bgColorHex = null)

        assertNull(updated.displayName)
        assertNull(updated.bgColorHex)
    }

    @Test
    fun `update throws NoSuchElementException for unknown user`() {
        assertFailsWith<NoSuchElementException> {
            service.update(UUID.randomUUID(), displayName = "x", bgColorHex = null)
        }
    }
}
