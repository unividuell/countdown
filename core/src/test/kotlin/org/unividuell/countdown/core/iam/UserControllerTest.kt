package org.unividuell.countdown.core.iam

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.UserProfileService
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean
    lateinit var profileService: UserProfileService

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")

    private fun principalFor(user: User) =
        authentication(
            OAuth2AuthenticationToken(
                CountdownOAuth2User(user, mapOf("login" to user.githubLogin)),
                CountdownOAuth2User(user, emptyMap()).authorities,
                "github",
            )
        )

    private fun user(isSuperAdmin: Boolean = false, displayName: String? = null) = User(
        id = uid, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        email = "cat@example.com", displayName = displayName, isSuperAdmin = isSuperAdmin,
    )

    @Test
    fun `GET me without auth returns 401`() {
        mockMvc.get("/api/me").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `GET me returns the current user with computed username`() {
        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = "Mr. Custom")))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(uid.toString()) }
            jsonPath("$.username") { value("Mr. Custom") }
            jsonPath("$.githubLogin") { value("octocat") }
            jsonPath("$.isSuperAdmin") { value(false) }
        }
    }

    @Test
    fun `PATCH me updates own profile`() {
        every { profileService.update(uid, "New Name", "#abcdef") } returns
                user(displayName = "New Name").copy(bgColorHex = "#abcdef")

        mockMvc.patch("/api/me") {
            with(principalFor(user()))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"New Name","bgColorHex":"#abcdef"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.username") { value("New Name") }
            jsonPath("$.bgColorHex") { value("#abcdef") }
        }
    }

    @Test
    fun `super-admin path forbidden for non-super-admin`() {
        mockMvc.get("/api/super-admin/ping") {
            with(principalFor(user(isSuperAdmin = false)))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `logout clears session and returns 204`() {
        mockMvc.post("/logout") {
            with(principalFor(user()))
            with(csrf())
        }.andExpect {
            status { isNoContent() }
        }
    }
}
