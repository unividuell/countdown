package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.*
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class MemberControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var membership: MembershipService
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var memberRepo: CommunityMemberRepository
    @MockkBean lateinit var userQuery: UserQuery

    private val uid = UUID.fromString("018f0000-0000-7000-8000-000000000000")
    private fun principal() = authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), mapOf("login" to "octocat")),
            CountdownOAuth2User(User(id = uid, githubId = 1L, githubLogin = "octocat"), emptyMap()).authorities, "github",
        )
    )
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @Test
    fun `admin generates an invite link`() {
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        every { membership.generateInvite(c.id!!) } returns InviteInfo("tok123", Instant.parse("2030-01-01T00:00:00Z"))
        mockMvc.post("/api/communities/team/invite") { with(principal()); with(csrf()) }
            .andExpect { status { isOk() }; jsonPath("$.url") { value(org.hamcrest.Matchers.containsString("/join/tok123")) } }
    }

    @Test
    fun `accept of expired token returns 410`() {
        every { membership.accept("tok", uid) } throws InviteExpiredException()
        mockMvc.post("/api/communities/join/tok") { with(principal()); with(csrf()) }
            .andExpect { status { isGone() } }
    }

    @Test
    fun `accept returns the community + status`() {
        every { membership.accept("tok", uid) } returns AcceptResult.JoinedPending(community("team"))
        mockMvc.post("/api/communities/join/tok") { with(principal()); with(csrf()) }
            .andExpect { status { isOk() }; jsonPath("$.status") { value("JOINED_PENDING") }; jsonPath("$.slug") { value("team") } }
    }

    @Test
    fun `GET members lists enriched member data`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { memberRepo.findByCommunityId(c.id!!) } returns listOf(
            CommunityMember(communityId = c.id!!, userId = memberId, status = MemberStatus.ACTIVE, isAdmin = false)
        )
        every { userQuery.findById(memberId) } returns User(id = memberId, githubId = 2L, githubLogin = "alice")
        mockMvc.get("/api/communities/team/members") { with(principal()) }
            .andExpect { status { isOk() }; jsonPath("$[0].username") { value("alice") } }
    }

    @Test
    fun `approve returns 204`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        justRun { membership.approve(c.id!!, memberId) }
        mockMvc.post("/api/communities/team/members/$memberId/approve") { with(principal()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `promote returns 204`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        justRun { membership.promote(c.id!!, memberId) }
        mockMvc.post("/api/communities/team/members/$memberId/promote") { with(principal()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `demote returns 204`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        justRun { membership.demote(c.id!!, memberId) }
        mockMvc.post("/api/communities/team/members/$memberId/demote") { with(principal()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `last-admin demote returns 409`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        every { membership.demote(c.id!!, memberId) } throws LastAdminException()
        mockMvc.post("/api/communities/team/members/$memberId/demote") { with(principal()); with(csrf()) }
            .andExpect { status { isConflict() } }
    }

    @Test
    fun `remove (admin removing other) returns 204`() {
        val memberId = UUID.randomUUID()
        val c = community("team")
        every { access.requireAdmin(uid, false, "team") } returns c
        justRun { membership.remove(c.id!!, memberId) }
        mockMvc.delete("/api/communities/team/members/$memberId") { with(principal()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `self-leave (active member removing themselves) returns 204`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        justRun { membership.leave(c.id!!, uid) }
        mockMvc.delete("/api/communities/team/members/$uid") { with(principal()); with(csrf()) }
            .andExpect { status { isNoContent() } }
    }

    @Test
    fun `GET invite returns the current link for an admin`() {
        val c = community("team").copy(inviteToken = "tok9", inviteTokenExpiresAt = Instant.parse("2030-01-01T00:00:00Z"))
        every { access.requireAdmin(uid, false, "team") } returns c
        mockMvc.get("/api/communities/team/invite") { with(principal()) }.andExpect {
            status { isOk() }
            jsonPath("$.url") { value(org.hamcrest.Matchers.containsString("/join/tok9")) }
        }
    }

    @Test
    fun `GET invite returns 204 when there is no active link`() {
        every { access.requireAdmin(uid, false, "team") } returns community("team") // no token
        mockMvc.get("/api/communities/team/invite") { with(principal()) }.andExpect {
            status { isNoContent() }
        }
    }
}
