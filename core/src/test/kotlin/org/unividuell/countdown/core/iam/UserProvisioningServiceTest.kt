package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.data.repository.findByIdOrNull
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.ExternalIdentity
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * The auth lib's hook against the real table: the upsert is SQL, which no mock exercises. The
 * values are ones no column default produces, so a write to the wrong column cannot pass.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    private fun github(subject: String, login: String, name: String? = null, email: String? = null) =
        ExternalIdentity(provider = "github", subject = subject, login = login, name = name, email = email)

    @Test
    fun `a first sign-in inserts the identity's row`() {
        val id = service.provision(
            identity = github(subject = "100", login = "octocat", name = "The Octocat", email = "cat@example.com"),
            roles = emptySet(),
        )

        id.version() shouldBe 7
        val user = repository.findByProviderAndSubject(provider = "github", subject = "100").shouldNotBeNull()
        user.id shouldBe id
        user.githubLogin shouldBe "octocat"
        user.githubName shouldBe "The Octocat"
        user.email shouldBe "cat@example.com"
        user.isSuperAdmin shouldBe false
        user.displayName.shouldBeNull()
        user.createdAt.shouldNotBeNull()
    }

    @Test
    fun `a later sign-in updates the provider's fields and keeps the user's own`() {
        val id = service.provision(
            identity = github(subject = "101", login = "old-login", name = "Old Name", email = "old@example.com"),
            roles = emptySet(),
        )
        val first = repository.findByIdOrNull(id).shouldNotBeNull()
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000", communityCreationAllowed = true))

        val again = service.provision(
            identity = github(subject = "101", login = "new-login", name = "New Name", email = "new@example.com"),
            roles = setOf("SUPER_ADMIN"),
        )

        again shouldBe id
        val synced = repository.findByIdOrNull(id).shouldNotBeNull()
        synced.githubLogin shouldBe "new-login"
        synced.githubName shouldBe "New Name"
        synced.email shouldBe "new@example.com"
        synced.isSuperAdmin shouldBe true
        synced.displayName shouldBe "Mr. Custom"
        synced.bgColorHex shouldBe "#ff0000"
        synced.communityCreationAllowed shouldBe true
    }

    @Test
    fun `the super-admin flag follows the roles in both directions`() {
        val id = service.provision(identity = github(subject = "102", login = "boss"), roles = setOf("SUPER_ADMIN"))
        repository.findByIdOrNull(id).shouldNotBeNull().isSuperAdmin shouldBe true

        service.provision(identity = github(subject = "102", login = "boss"), roles = emptySet())
        repository.findByIdOrNull(id).shouldNotBeNull().isSuperAdmin shouldBe false
    }

    @Test
    fun `the same login at another provider is another account`() {
        val atGitHub = service.provision(identity = github(subject = "103", login = "hermes"), roles = emptySet())
        val asTestUser = service.provision(
            identity = ExternalIdentity(provider = "test", subject = "hermes", login = "hermes", name = null, email = null),
            roles = emptySet(),
        )

        asTestUser shouldNotBe atGitHub
    }

    @Test
    fun `a GitHub row from before the lib is found again by its numeric id`() {
        // iam/V3 turned github_id 123 into subject "123"; the lib maps GitHub's id 123 the same way.
        val migrated = repository.save(
            User(provider = "github", subject = "123", githubLogin = "octocat", displayName = "Kept"),
        )

        val id = service.provision(identity = github(subject = "123", login = "octocat-renamed"), roles = emptySet())

        id shouldBe migrated.id
        repository.findByIdOrNull(id).shouldNotBeNull().let {
            it.githubLogin shouldBe "octocat-renamed"
            it.displayName shouldBe "Kept"
        }
    }
}
