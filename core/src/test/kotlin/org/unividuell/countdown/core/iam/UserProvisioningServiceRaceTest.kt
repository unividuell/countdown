package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

class UserProvisioningServiceRaceTest {

    // Simulates a concurrent insert: findByProviderAndSubject misses first (insert path),
    // the INSERT (id == null) raises DuplicateKeyException once, then the row is
    // found on re-fetch.
    @Test
    fun `recovers from a concurrent insert by re-fetching and syncing`() {
        val existing = User(
            id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
            subject = "42", githubLogin = "old", githubName = "Old", displayName = "Keep me",
        )

        val repo = mockk<UserRepository>()
        every { repo.findByProviderAndSubject(provider = "github", subject = "42") } returnsMany listOf(null, existing)
        every { repo.save(match { it.id == null }) } throws DuplicateKeyException("duplicate github_id")
        every { repo.save(match { it.id != null }) } answers { firstArg() }

        val service = UserProvisioningService(repo, SuperAdminProperties(emptyList()))

        val result = service.provision(
            provider = "github", subject = "42", login = "new-login", name = "New Name", email = "new@example.com",
        )

        result.githubLogin shouldBe "new-login"
        result.githubName shouldBe "New Name"
        result.displayName shouldBe "Keep me"

        verify(exactly = 1) { repo.save(match { it.id == null }) }
        verify(exactly = 2) { repo.findByProviderAndSubject(provider = "github", subject = "42") }
    }
}
