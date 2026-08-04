package org.unividuell.countdown.core.iam

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminUserDetail
import org.unividuell.countdown.core.iam.internal.SuperAdminUserListEntry
import org.unividuell.countdown.core.iam.internal.SuperAdminUserService
import org.unividuell.countdown.core.iam.internal.UserNotFoundException
import org.unividuell.countdown.core.principalFor
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminUserControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var service: SuperAdminUserService

    private val uid = TEST_USER_ID

    private fun detail(allowed: Boolean = false) = SuperAdminUserDetail(
        userId = uid, username = "Octocat", githubLogin = "octocat", githubName = "The Octocat",
        displayName = null, email = "cat@example.com", bgColorHex = null, isSuperAdmin = false,
        communityCreationAllowed = allowed,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"), updatedAt = null,
    )

    @Test
    fun `listing users without auth returns 401`() {
        mockMvc.get("/api/super-admin/users").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `listing users is forbidden for a non-super-admin`() {
        mockMvc.get("/api/super-admin/users") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun `lists users for a super-admin`() {
        every { service.list() } returns listOf(
            SuperAdminUserListEntry(
                userId = uid, username = "Octocat", githubLogin = "octocat",
                isSuperAdmin = false, communityCreationAllowed = true,
                createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            )
        )
        mockMvc.get("/api/super-admin/users") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].username") { value("Octocat") }
                jsonPath("$[0].communityCreationAllowed") { value(true) }
            }
    }

    @Test
    fun `returns a user detail for a super-admin`() {
        every { service.detail(uid) } returns detail(allowed = true)
        mockMvc.get("/api/super-admin/users/$uid") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.githubLogin") { value("octocat") }
                jsonPath("$.email") { value("cat@example.com") }
                jsonPath("$.communityCreationAllowed") { value(true) }
                // Present-and-null, not omitted: no NON_NULL inclusion is configured and the
                // frontend type is `string | null`.
                jsonPath("$.displayName") { isEmpty() }
            }
    }

    @Test
    fun `returns 404 for an unknown user`() {
        every { service.detail(uid) } throws UserNotFoundException("user $uid not found")
        mockMvc.get("/api/super-admin/users/$uid") { with(principalFor(superAdmin = true)) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `grants the clearance for a super-admin`() {
        every { service.setCommunityCreation(uid, true) } returns detail(allowed = true)

        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.communityCreationAllowed") { value(true) }
        }
    }

    @Test
    fun `granting the clearance without a CSRF token is rejected`() {
        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true))
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `granting the clearance is forbidden for a non-super-admin`() {
        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = false)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `granting the clearance for an unknown user returns 404`() {
        every { service.setCommunityCreation(uid, true) } throws UserNotFoundException("user $uid not found")

        mockMvc.put("/api/super-admin/users/$uid/community-creation") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"allowed":true}"""
        }.andExpect { status { isNotFound() } }
    }
}
