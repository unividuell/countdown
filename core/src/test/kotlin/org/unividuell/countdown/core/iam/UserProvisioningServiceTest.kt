package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=bossuser", "app.test-auth.enabled=false"])
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `first login inserts a new user`() {
        val user = service.provision(
            provider = "github", subject = "100", login = "octocat", name = "The Octocat", email = "cat@example.com",
        )

        user.provider shouldBe "github"
        user.subject shouldBe "100"
        user.githubLogin shouldBe "octocat"
        user.githubName shouldBe "The Octocat"
        user.email shouldBe "cat@example.com"
        user.isSuperAdmin shouldBe false
        user.displayName.shouldBeNull()
        repository.count() shouldBe 1
    }

    @Test
    fun `repeat login syncs github fields but preserves user-owned fields`() {
        val first = service.provision(
            provider = "github", subject = "101", login = "old-login", name = "Old Name", email = "old@example.com",
        )
        // simulate user-owned edits
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000"))

        val synced = service.provision(
            provider = "github", subject = "101", login = "new-login", name = "New Name", email = "new@example.com",
        )

        synced.githubLogin shouldBe "new-login"
        synced.githubName shouldBe "New Name"
        synced.email shouldBe "new@example.com"
        synced.displayName shouldBe "Mr. Custom"
        synced.bgColorHex shouldBe "#ff0000"
        repository.count() shouldBe 1
    }

    @Test
    fun `super-admin flag follows the allowlist on every login`() {
        val notSuperAdmin = service.provision(provider = "github", subject = "102", login = "regular", name = null, email = null)
        notSuperAdmin.isSuperAdmin shouldBe false

        val superAdmin = service.provision(provider = "github", subject = "103", login = "bossuser", name = null, email = null)
        superAdmin.isSuperAdmin shouldBe true
    }
}
