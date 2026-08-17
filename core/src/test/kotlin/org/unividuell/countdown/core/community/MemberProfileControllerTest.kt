package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityAccess
import org.unividuell.countdown.core.community.internal.CommunityAccessDeniedException
import org.unividuell.countdown.core.community.internal.MemberProfileResponse
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.principalFor
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class MemberProfileControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var profiles: MemberProfileService

    private val uid = TEST_USER_ID
    private val community = Community(
        id = UUID.randomUUID(), name = "Team", slug = "team", createdBy = uid,
    )
    private val identity = MemberIdentity(
        username = "Zwerg", avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
    )

    private fun admitted() {
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team") } returns community
    }

    @Test
    fun `GET profile without auth returns 401`() {
        mockMvc.get("/api/communities/team/me/profile")
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `a non-member gets 404`() {
        every {
            access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team")
        } throws CommunityAccessDeniedException()

        mockMvc.get("/api/communities/team/me/profile") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET profile answers the raw override and the resulting identity`() {
        admitted()
        every { profiles.get(communityId = community.id!!, userId = uid) } returns
            MemberProfileResponse(displayName = "Zwerg", bgColorHex = "#8e44ad", identity = identity)

        mockMvc.get("/api/communities/team/me/profile") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value("Zwerg") }
            jsonPath("$.bgColorHex") { value("#8e44ad") }
            jsonPath("$.identity.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `PUT writes the desired state`() {
        admitted()
        every {
            profiles.put(
                communityId = community.id!!, userId = uid,
                displayName = "Zwerg", bgColorHex = "#8e44ad",
            )
        } returns MemberProfileResponse(
            displayName = "Zwerg", bgColorHex = "#8e44ad", identity = identity,
        )

        mockMvc.put("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":"#8e44ad"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.identity.username") { value("Zwerg") }
        }
    }

    @Test
    fun `a malformed colour is a 400`() {
        admitted()
        every {
            profiles.put(communityId = any(), userId = any(), displayName = any(), bgColorHex = any())
        } throws IllegalArgumentException("bgColorHex must be a valid hex colour")

        mockMvc.put("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":null,"bgColorHex":"rebeccapurple"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `DELETE clears the override`() {
        admitted()
        every { profiles.clear(communityId = community.id!!, userId = uid) } returns
            MemberProfileResponse(displayName = null, bgColorHex = null, identity = identity)

        mockMvc.delete("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isNoContent() } }

        verify { profiles.clear(communityId = community.id!!, userId = uid) }
    }
}
