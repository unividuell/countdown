package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProfileService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

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

        updated.displayName shouldBe "Mr. Custom"
        updated.bgColorHex shouldBe "#00ff00"
        updated.githubLogin shouldBe "octocat"
        updated.githubName shouldBe "The Octocat"
    }

    @Test
    fun `null clears a user-owned field`() {
        val saved = repository.save(
            User(githubId = 201L, githubLogin = "octocat", displayName = "old", bgColorHex = "#111111")
        )

        val updated = service.update(saved.id!!, displayName = null, bgColorHex = null)

        updated.displayName.shouldBeNull()
        updated.bgColorHex.shouldBeNull()
    }

    @Test
    fun `update throws NoSuchElementException for unknown user`() {
        shouldThrow<NoSuchElementException> {
            service.update(UUID.randomUUID(), displayName = "x", bgColorHex = null)
        }
    }
}
