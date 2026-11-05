package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.justRun
import io.mockk.verify
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.*
import org.unividuell.auth.test.withCsrfToken
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.principalFor
import java.time.Instant
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
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val uid = TEST_USER_ID
    private fun community(slug: String) = Community(id = UUID.randomUUID(), name = "Team", slug = slug, createdBy = uid)

    @BeforeEach
    fun stubFreeze() {
        every { editions.isFrozen(any()) } returns false
        every { identities.of(communityId = any(), userId = any()) } returns null
    }

    @Test
    fun `POST creates a community`() {
        val c = community("team-a")
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(creatorUserId = uid, rawName = "Team A") } returns c
        every { identities.of(communityId = c.id!!, userId = uid) } returns null
        mockMvc.post("/api/communities") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isCreated() }; jsonPath("$.slug") { value("team-a") } }
    }

    @Test
    fun `create answers with edition null`() {
        val c = community("team-a")
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(creatorUserId = uid, rawName = "Team A") } returns c
        mockMvc.post("/api/communities") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.edition") { value(null) }
        }
        verify(exactly = 0) { editions.create(communityId = any(), draft = any()) }
    }

    @Test
    fun `POST surfaces slug conflict as 409`() {
        every { users.mayCreateCommunities(uid) } returns true
        every { communityService.create(creatorUserId = uid, rawName = "Team A") } throws SlugUnavailableException("slug 'team-a' is taken")
        mockMvc.post("/api/communities") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Team A"}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `POST is forbidden without a community-creation clearance`() {
        every { users.mayCreateCommunities(uid) } returns false
        mockMvc.post("/api/communities") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
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
            with(principalFor(superAdmin = true)); with(withCsrfToken())
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
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "secret") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/secret") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `PATCH requires admin`() {
        every { access.requireAdmin(userId = uid, isSuperAdmin = false, slug = "team-a") } throws NotAdminException()
        mockMvc.patch("/api/communities/team-a") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
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
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"communityId":"018f0000-0000-7000-8000-000000000001"}"""
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin and pendingCount for an admin`() {
        val c = community("team")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team") } returns c
        every { query.isAdmin(communityId = c.id!!, userId = uid) } returns true
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 3
        every { editions.active(c.id!!) } returns anEdition(communityId = c.id!!, id = UUID.randomUUID())
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
            jsonPath("$.pendingCount") { value(3) }
        }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin false and pendingCount 0 for a non-admin member`() {
        val c = community("team")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team") } returns c
        every { query.isAdmin(communityId = c.id!!, userId = uid) } returns false
        every { editions.active(c.id!!) } returns anEdition(communityId = c.id!!, id = UUID.randomUUID())
        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(false) }
            jsonPath("$.pendingCount") { value(0) }
        }
    }

    @Test
    fun `GET by slug returns viewerIsAdmin true for a super-admin`() {
        val c = community("team")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = true, slug = "team") } returns c
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 0
        every { editions.active(c.id!!) } returns anEdition(communityId = c.id!!, id = UUID.randomUUID())
        mockMvc.get("/api/communities/team") { with(principalFor(superAdmin = true)) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIsAdmin") { value(true) }
        }
    }

    private fun asMember(c: Community, admin: Boolean = false) {
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = c.slug) } returns c
        every { query.isAdmin(communityId = c.id!!, userId = uid) } returns admin
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 0
    }

    private fun asAdmin(c: Community) {
        every { access.requireAdmin(userId = uid, isSuperAdmin = false, slug = c.slug) } returns c
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 0
    }

    private val editionJson = """
        {"label":null,"startsAt":"2026-12-20T17:00:00Z","startsAtTimezone":"Europe/Berlin",
         "phaseTwoStartRound":null,"gamesFromRound":-30}
    """.trimIndent()

    @Test
    fun `get without an active edition answers 200 with edition null`() {
        val c = community("team")
        asMember(c)
        every { editions.active(c.id!!) } returns null

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.edition") { value(null) }
            jsonPath("$.viewerIsAdmin") { value(false) }
        }
    }

    @Test
    fun `get with an active edition nests it`() {
        val c = community("team")
        asMember(c)
        val edition = anEdition(communityId = c.id!!, label = "Team 2026", startsAtTimezone = "America/New_York")
        every { editions.active(c.id!!) } returns edition
        every { editions.isFrozen(edition) } returns true

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.edition.label") { value("Team 2026") }
            jsonPath("$.edition.startsAtTimezone") { value("America/New_York") }
            jsonPath("$.edition.gamesFromRound") { value(-30) }
            jsonPath("$.edition.gamesUntilRound") { value(0) }
            jsonPath("$.edition.frozen") { value(true) }
        }
    }

    @Test
    fun `get with an active edition reports one that is not frozen`() {
        val c = community("team")
        asMember(c, admin = true)
        val edition = anEdition(communityId = c.id!!)
        every { editions.active(c.id!!) } returns edition
        every { editions.isFrozen(edition) } returns false

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.edition.frozen") { value(false) }
        }
    }

    @Test
    fun `patch renames only`() {
        val c = community("team")
        asAdmin(c)
        every { communityService.rename(community = c, name = "Neu Name") } returns c.copy(name = "Neu Name")
        every { editions.active(c.id!!) } returns null

        mockMvc.patch("/api/communities/team") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Neu Name"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Neu Name") }
        }
        verify(exactly = 0) { editions.create(communityId = any(), draft = any()) }
        verify(exactly = 0) { editions.replace(communityId = any(), draft = any()) }
    }

    @Test
    fun `post editions creates and answers 201`() {
        val c = community("team")
        asAdmin(c)
        val draft = EditionDraft(
            label = null, startsAt = Instant.parse("2026-12-20T17:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = -30,
        )
        every { editions.create(communityId = c.id!!, draft = draft) } returns
            anEdition(communityId = c.id!!, label = null)

        mockMvc.post("/api/communities/team/editions") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect {
            status { isCreated() }
            jsonPath("$.edition.label") { value(null) }
            jsonPath("$.edition.gamesFromRound") { value(-30) }
        }
    }

    @Test
    fun `post editions answers 409 when one is active`() {
        val c = community("team")
        asAdmin(c)
        every { editions.create(communityId = c.id!!, draft = any()) } throws
            EditionConflictException("community already has an active edition")

        mockMvc.post("/api/communities/team/editions") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `put active edition replaces it and answers 200`() {
        val c = community("team")
        asAdmin(c)
        every { editions.replace(communityId = c.id!!, draft = any()) } returns
            anEdition(communityId = c.id!!, label = "Neu")

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect {
            status { isOk() }
            jsonPath("$.edition.label") { value("Neu") }
        }
    }

    @Test
    fun `put active edition answers 404 without one`() {
        val c = community("team")
        asAdmin(c)
        every { editions.replace(communityId = c.id!!, draft = any()) } throws EditionNotFoundException()

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `put active edition answers 400 without gamesFromRound`() {
        val c = community("team")
        asAdmin(c)

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = """{"label":null,"startsAt":"2026-12-20T17:00:00Z","startsAtTimezone":"Europe/Berlin","phaseTwoStartRound":null}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `put active edition answers 409 with the reason when frozen`() {
        val c = community("team")
        asAdmin(c)
        every { editions.replace(communityId = c.id!!, draft = any()) } throws
            EditionFrozenException("the run's grid is fixed since 2026-05-31T09:00:00Z")

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect {
            status { isConflict() }
            jsonPath("$.detail") { value(containsString("fixed")) }
        }
    }

    @Test
    fun `put active edition is 409 for a super-admin too`() {
        // The rule protects the play history, not the roles — a bypass branch in the controller
        // would otherwise pass every other test in this class.
        val c = community("team")
        every { access.requireAdmin(userId = uid, isSuperAdmin = true, slug = "team") } returns c
        every { editions.replace(communityId = c.id!!, draft = any()) } throws
            EditionFrozenException("the run's grid is fixed since 2026-05-31T09:00:00Z")

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor(superAdmin = true)); with(withCsrfToken())
            contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun `post and put editions are admin-only`() {
        every { access.requireAdmin(userId = uid, isSuperAdmin = false, slug = "team") } throws NotAdminException()

        mockMvc.post("/api/communities/team/editions") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect { status { isForbidden() } }

        mockMvc.put("/api/communities/team/editions/active") {
            with(principalFor()); with(withCsrfToken()); contentType = MediaType.APPLICATION_JSON
            content = editionJson
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `GET community carries how the viewer appears here`() {
        val c = community("team")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = false, slug = "team") } returns c
        every { query.isAdmin(communityId = c.id!!, userId = uid) } returns false
        every { editions.active(c.id!!) } returns anEdition(communityId = c.id!!, id = UUID.randomUUID())
        every {
            identities.of(communityId = any(), userId = TEST_USER_ID)
        } returns MemberIdentity(
            username = "Zwerg",
            avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
        )

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIdentity.username") { value("Zwerg") }
            jsonPath("$.viewerIdentity.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `a super-admin who is not a member has no identity here`() {
        val c = community("team")
        every { access.requireActiveMember(userId = uid, isSuperAdmin = true, slug = "team") } returns c
        every { memberRepo.countByCommunityIdAndStatus(communityId = c.id!!, status = MemberStatus.PENDING) } returns 0
        every { editions.active(c.id!!) } returns anEdition(communityId = c.id!!, id = UUID.randomUUID())
        every { identities.of(communityId = any(), userId = TEST_USER_ID) } returns null

        mockMvc.get("/api/communities/team") { with(principalFor(superAdmin = true)) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIdentity") { value(null) }
        }
    }
}
