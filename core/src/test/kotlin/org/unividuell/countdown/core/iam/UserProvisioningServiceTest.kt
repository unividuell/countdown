package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=bossuser"])
class UserProvisioningServiceTest(
    @Autowired val service: UserProvisioningService,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `first login inserts a new user`() {
        val user = service.provision(githubId = 100L, login = "octocat", name = "The Octocat", email = "cat@example.com")

        assertEquals("octocat", user.githubLogin)
        assertEquals("The Octocat", user.githubName)
        assertEquals("cat@example.com", user.email)
        assertFalse(user.isSuperAdmin)
        assertNull(user.displayName)
        assertEquals(1, repository.count())
    }

    @Test
    fun `repeat login syncs github fields but preserves user-owned fields`() {
        val first = service.provision(101L, "old-login", "Old Name", "old@example.com")
        // simulate user-owned edits
        repository.save(first.copy(displayName = "Mr. Custom", bgColorHex = "#ff0000"))

        val synced = service.provision(101L, "new-login", "New Name", "new@example.com")

        assertEquals("new-login", synced.githubLogin)
        assertEquals("New Name", synced.githubName)
        assertEquals("new@example.com", synced.email)
        assertEquals("Mr. Custom", synced.displayName, "display_name must not be overwritten by sync")
        assertEquals("#ff0000", synced.bgColorHex, "bg_color_hex must not be overwritten by sync")
        assertEquals(1, repository.count(), "must update, not insert a duplicate")
    }

    @Test
    fun `super-admin flag follows the allowlist on every login`() {
        val notSuperAdmin = service.provision(102L, "regular", null, null)
        assertFalse(notSuperAdmin.isSuperAdmin)

        val superAdmin = service.provision(103L, "bossuser", null, null)
        assertTrue(superAdmin.isSuperAdmin)
    }
}
