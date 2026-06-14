package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.*
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class CommunityControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var communityService: CommunityService
    @MockkBean lateinit var query: org.unividuell.countdown.core.community.MembershipQuery
    @MockkBean lateinit var communityQuery: org.unividuell.countdown.core.community.CommunityQuery
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var selection: SelectionService
    @MockkBean lateinit var memberRepo: CommunityMemberRepository

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal(superAdmin: Boolean = false) = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat", isSuperAdmin = superAdmin), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat", isSuperAdmin = superAdmin), emptyMap()).authorities,
            "github",
        )
    )
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @Test
    fun `POST creates a community`() {
        every { communityService.create(uid, "Team A") } returns community("team-a")
        mockMvc.post("/api/communities") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isCreated() }; jsonPath("$.slug") { value("team-a") } }
    }

    @Test
    fun `POST surfaces slug conflict as 409`() {
        every { communityService.create(uid, "join") } throws SlugUnavailableException("reserved")
        mockMvc.post("/api/communities") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"join"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `GET communities lists active memberships`() {
        every { query.activeCommunitiesOf(uid) } returns listOf(community("team-a"))
        mockMvc.get("/api/communities") { with(principal()) }
            .andExpect { status { isOk() }; jsonPath("$[0].slug") { value("team-a") } }
    }

    @Test
    fun `GET by slug requires membership`() {
        every { access.requireActiveMember(uid, false, "secret") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/secret") { with(principal()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `PATCH requires admin`() {
        every { access.requireAdmin(uid, false, "team-a") } throws NotAdminException()
        mockMvc.patch("/api/communities/team-a") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"New"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `GET selection returns communityId`() {
        every { selection.get(uid) } returns UUID.fromString("018f0000-0000-7000-8000-000000000001")
        mockMvc.get("/api/communities/selection") { with(principal()) }
            .andExpect { status { isOk() }; jsonPath("$.communityId") { value("018f0000-0000-7000-8000-000000000001") } }
    }

    @Test
    fun `PUT selection returns 204`() {
        justRun { selection.set(uid, any()) }
        mockMvc.put("/api/communities/selection") {
            with(principal()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"communityId":"018f0000-0000-7000-8000-000000000001"}"""
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin and pendingCount for an admin`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns true
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 3
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
            jsonPath("$.pendingCount") { value(3) }
        }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin false and pendingCount 0 for a non-admin member`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns false
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(false) }
            jsonPath("$.pendingCount") { value(0) }
        }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin true for a super-admin`() {
        val c = community("team")
        every { access.requireActiveMember(uid, true, "team") } returns c
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 0
        mockMvc.get("/api/communities/team") { with(principal(superAdmin = true)) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
        }
    }

    @Test
    fun `GET by slug returns the startsAtTimezone`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns false
        mockMvc.get("/api/communities/team") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
        }
    }
}
