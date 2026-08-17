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
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.AvatarPreviewResponse
import org.unividuell.countdown.core.iam.internal.StaleSessionException
import org.unividuell.countdown.core.iam.internal.UserProfileService
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean
    lateinit var profileService: UserProfileService

    private val uid = TEST_USER_ID

    private fun user(
        isSuperAdmin: Boolean = false,
        displayName: String? = null,
        communityCreationAllowed: Boolean = false,
    ) = User(
        id = uid, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        email = "cat@example.com", displayName = displayName, isSuperAdmin = isSuperAdmin,
        communityCreationAllowed = communityCreationAllowed,
    )

    @Test
    fun `GET me without auth returns 401`() {
        mockMvc.get("/api/me").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `GET me returns the current user with computed username`() {
        every { profileService.current(uid) } returns user(displayName = "Mr. Custom")

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
    fun `GET me carries the avatar the roster would draw`() {
        every { profileService.current(uid) } returns user(displayName = "Turanga Leela")

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = "Turanga Leela")))
        }.andExpect {
            status { isOk() }
            jsonPath("$.avatar.shortName") { value("TRNG") }
            jsonPath("$.avatar.bgColorHex") { value(Avatar.of(user(displayName = "Turanga Leela")).bgColorHex) }
        }
    }

    @Test
    fun `GET me resolves the avatar colour but leaves the chosen one unset`() {
        // The two fields answer different questions: what to paint with, and what the user picked.
        // A profile form prefilling from bgColorHex must not see a choice that was never made.
        every { profileService.current(uid) } returns user()

        mockMvc.get("/api/me") { with(principalFor(user())) }.andExpect {
            status { isOk() }
            jsonPath("$.bgColorHex") { doesNotExist() }
            jsonPath("$.avatar.bgColorHex") { value(org.hamcrest.Matchers.matchesPattern("^#[0-9a-f]{6}$")) }
        }
    }

    // `with(csrf())` permanently swaps the shared, context-cached CsrfFilter's token repository
    // for a test double, for every later request in this class — so once any test uses it, a
    // plain GET here would stop getting a fresh XSRF-TOKEN cookie, no matter which test ran first.
    // Forcing a pristine context right before this assertion removes that dependency entirely,
    // rather than relying on this test happening to run before the first `with(csrf())` call.
    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.BEFORE_METHOD)
    fun `GET me sets the XSRF-TOKEN cookie so the SPA can echo it on mutating requests`() {
        every { profileService.current(uid) } returns user()

        mockMvc.get("/api/me") {
            with(principalFor(user()))
        }.andExpect {
            status { isOk() }
            cookie { exists("XSRF-TOKEN") }
        }
    }

    @Test
    fun `GET me reports the clearance from the row, not from the session principal`() {
        // The principal was serialized into the session without a clearance; the row has one.
        every { profileService.current(uid) } returns user(communityCreationAllowed = true)

        mockMvc.get("/api/me") {
            with(principalFor(user(communityCreationAllowed = false)))
        }.andExpect {
            status { isOk() }
            jsonPath("$.mayCreateCommunities") { value(true) }
        }
    }

    @Test
    fun `GET me reports a super-admin as allowed to create communities`() {
        every { profileService.current(uid) } returns user(isSuperAdmin = true)

        mockMvc.get("/api/me") { with(principalFor(user(isSuperAdmin = true))) }
            .andExpect {
                status { isOk() }
                jsonPath("$.mayCreateCommunities") { value(true) }
            }
    }

    @Test
    fun `GET me returns 401 when the session outlived its user row`() {
        every { profileService.current(uid) } throws
                StaleSessionException("user $uid from the session no longer exists")

        mockMvc.get("/api/me") { with(principalFor(user())) }
            .andExpect { status { isUnauthorized() } }
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

    @Test
    fun `PATCH me with malformed bgColorHex responds 400`() {
        every { profileService.update(uid, null, "12345") } throws
                IllegalArgumentException("bgColorHex must be a valid hex colour in the form #rrggbb, got: 12345")

        mockMvc.patch("/api/me") {
            with(principalFor(user()))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":null,"bgColorHex":"12345"}"""
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `GET me carries the raw chosen name next to the effective one`() {
        every { profileService.current(uid) } returns user(displayName = "Mr. Custom")

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = "Mr. Custom")))
        }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value("Mr. Custom") }
            jsonPath("$.username") { value("Mr. Custom") }
        }
    }

    @Test
    fun `GET me reports no chosen name when there is none`() {
        every { profileService.current(uid) } returns user(displayName = null)

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = null)))
        }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value(null) }
            jsonPath("$.username") { value("The Octocat") }
        }
    }

    @Test
    fun `POST avatar-preview answers what saving would produce`() {
        every {
            profileService.preview(userId = uid, displayName = "Zwerg", bgColorHex = "#8e44ad")
        } returns AvatarPreviewResponse(
            username = "Zwerg", avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
        )

        mockMvc.post("/api/me/avatar-preview") {
            with(principalFor(user())); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":"#8e44ad"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.username") { value("Zwerg") }
            jsonPath("$.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `a preview without auth returns 401`() {
        mockMvc.post("/api/me/avatar-preview") {
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":null}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `a preview with an over-length name is a 400`() {
        val tooLong = "x".repeat(33)
        every {
            profileService.preview(userId = uid, displayName = tooLong, bgColorHex = null)
        } throws IllegalArgumentException("displayName must be at most 32 characters, got 33")

        mockMvc.post("/api/me/avatar-preview") {
            with(principalFor(user())); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"$tooLong","bgColorHex":null}"""
        }.andExpect { status { isBadRequest() } }
    }
}
