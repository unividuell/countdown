package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminUserService
import org.unividuell.countdown.core.iam.internal.UserNotFoundException
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

/** `test-auth.enabled=false` keeps the seeded Futurama users out of this context (see SuperAdminRosterServiceTest). */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.test-auth.enabled=false"])
class SuperAdminUserServiceTest(
    @Autowired val service: SuperAdminUserService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `lists users by name and reports the raw clearance`() {
        repository.save(User(githubId = 401L, githubLogin = "zoe", displayName = "Zoe"))
        repository.save(
            User(githubId = 402L, githubLogin = "adam", displayName = "Adam", communityCreationAllowed = true)
        )
        // Super-admin without a stored clearance: the list must show the raw column, so false.
        repository.save(User(githubId = 403L, githubLogin = "boss", displayName = "Boss", isSuperAdmin = true))

        val names = service.list().map { it.username }
        names shouldBe listOf("Adam", "Boss", "Zoe")

        val byName = service.list().associateBy { it.username }
        byName["Adam"]!!.communityCreationAllowed shouldBe true
        byName["Boss"]!!.communityCreationAllowed shouldBe false
        byName["Boss"]!!.isSuperAdmin shouldBe true
    }

    @Test
    fun `returns a detail view and rejects an unknown id`() {
        val saved = repository.save(
            User(githubId = 404L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com")
        )

        val detail = service.detail(saved.id!!)
        detail.githubLogin shouldBe "octocat"
        detail.email shouldBe "cat@example.com"
        detail.communityCreationAllowed shouldBe false

        shouldThrow<UserNotFoundException> { service.detail(UUID.randomUUID()) }
    }
}
