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
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.*
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.principalFor
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class CommunityControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var communityService: CommunityService
    @MockkBean lateinit var editions: EditionService
    @MockkBean lateinit var query: org.unividuell.countdown.core.community.MembershipQuery
    @MockkBean lateinit var communityQuery: org.unividuell.countdown.core.community.CommunityQuery
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var selection: SelectionService
    @MockkBean lateinit var memberRepo: CommunityMemberRepository
    @MockkBean lateinit var users: org.unividuell.countdown.core.iam.UserQuery

    private val uid = TEST_USER_ID
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @Test
    fun `POST creates a community`() {
        val c = community("team-a")
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(uid, "Team A") } returns c
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team A",
        )
        mockMvc.post("/api/communities") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isCreated() }; jsonPath("$.slug") { value("team-a") } }
    }

    @Test
    fun `POST surfaces slug conflict as 409`() {
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(uid, "Team A") } throws SlugUnavailableException("slug 'team-a' is taken")
        mockMvc.post("/api/communities") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `POST is forbidden without a community-creation clearance`() {
        every { users.mayCreateCommunities(uid) } returns false
        mockMvc.post("/api/communities") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect {
            status { isForbidden() }
            // Without a body assertion this is indistinguishable from the CsrfFilter's 403,
            // which is returned before authorization runs at all.
            jsonPath("$.detail") { value("Not allowed to create communities") }
        }
    }

    @Test
    fun `POST is forbidden for a super-admin principal whose live clearance is false`() {
        // The port is the only authority: it already folds super-admin in, so the controller must
        // not re-combine me.isSuperAdmin. Without this case a stray `!me.isSuperAdmin &&` in the
        // guard would pass every other POST test in this class.
        every { users.mayCreateCommunities(uid) } returns false
        mockMvc.post("/api/communities") {
            with(principalFor(superAdmin = true)); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `GET communities lists active memberships`() {
        every { query.activeCommunitiesOf(uid) } returns listOf(community("team-a"))
        mockMvc.get("/api/communities") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$[0].slug") { value("team-a") } }
    }

    @Test
    fun `GET by slug requires membership`() {
        every { access.requireActiveMember(uid, false, "secret") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/secret") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `PATCH requires admin`() {
        every { access.requireAdmin(uid, false, "team-a") } throws NotAdminException()
        mockMvc.patch("/api/communities/team-a") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"New"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `GET selection returns communityId`() {
        every { selection.get(uid) } returns UUID.fromString("018f0000-0000-7000-8000-000000000001")
        mockMvc.get("/api/communities/selection") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$.communityId") { value("018f0000-0000-7000-8000-000000000001") } }
    }

    @Test
    fun `PUT selection returns 204`() {
        justRun { selection.set(uid, any()) }
        mockMvc.put("/api/communities/selection") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"communityId":"018f0000-0000-7000-8000-000000000001"}"""
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin and pendingCount for an admin`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns true
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 3
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026",
        )
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
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
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026",
        )
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
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
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026",
        )
        mockMvc.get("/api/communities/team") { with(principalFor(superAdmin = true)) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
        }
    }

    @Test
    fun `GET by slug returns the timezone of the active edition`() {
        val c = community("team")
        every { access.requireActiveMember(uid, false, "team") } returns c
        every { query.isAdmin(c.id!!, uid) } returns false
        every { editions.requireActive(c.id!!) } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Team 2026",
        )
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.startsAtTimezone") { value("Europe/Berlin") }
            jsonPath("$.editionLabel") { value("Team 2026") }
            jsonPath("$.gamesUntilRound") { value(0) }
        }
    }

    @Test
    fun `POST editions returns the new run with the inherited setup`() {
        val c = community("rollover")
        every { access.requireAdmin(uid, false, "rollover") } returns c
        every { editions.startNew(c.id!!, "Rollover 2027") } returns CommunityEdition(
            id = UUID.randomUUID(), communityId = c.id!!, label = "Rollover 2027",
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20, gamesFromRound = 24,
        )
        every { memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) } returns 0

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"Rollover 2027"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.editionLabel") { value("Rollover 2027") }
            jsonPath("$.startsAtTimezone") { value("America/New_York") }
            jsonPath("$.phaseTwoStartRound") { value(20) }
            jsonPath("$.gamesFromRound") { value(24) }
        }
    }

    @Test
    fun `POST editions is forbidden for a non-admin member`() {
        every { access.requireAdmin(uid, false, "rollover") } throws NotAdminException()

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"Nope 2027"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `POST editions surfaces a too-short label as 400`() {
        val c = community("rollover")
        every { access.requireAdmin(uid, false, "rollover") } returns c
        every { editions.startNew(c.id!!, "ab") } throws IllegalArgumentException("label must be 3..50 chars")

        mockMvc.post("/api/communities/rollover/editions") {
            with(principalFor()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":"ab"}"""
        }.andExpect { status { isBadRequest() } }
    }
}
