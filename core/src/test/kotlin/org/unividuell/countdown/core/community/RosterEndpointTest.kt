package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class RosterEndpointTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var memberRepo: CommunityMemberRepository
    @MockkBean lateinit var userQuery: UserQuery
    @MockkBean lateinit var points: MemberPointsQuery

    private val uid = TEST_USER_ID
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")
    private val pending = UUID.fromString("0190f1b2-0000-7000-8000-000000000003")
    private val community = Community(id = UUID.randomUUID(), name = "Team", slug = "team", createdBy = uid)

    private fun member(userId: UUID, status: MemberStatus, joined: String) = CommunityMember(
        communityId = community.id!!, userId = userId, status = status,
        createdAt = Instant.parse(joined),
    )

    private fun admitted() {
        every { access.requireActiveMember(uid, false, "team") } returns community
    }

    @Test
    fun `a non-member gets 404`() {
        every { access.requireActiveMember(uid, false, "team") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `lists only active members, ranked by points`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
            member(pending, MemberStatus.PENDING, "2026-01-03T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 3, live = null),
            bob to MemberPoints(stable = 10, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].shortName") { value("BNDR") }
            jsonPath("$[0].fullName") { value("Bender") }
            jsonPath("$[1].shortName") { value("AMY") }
        }
    }

    @Test
    fun `live points count towards the rank they are shown with`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        // bob leads on stable points, alice overtakes him once the live round counts.
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 8, live = 5),
            bob to MemberPoints(stable = 10, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].shortName") { value("AMY") }
            jsonPath("$[0].points.stable") { value(8) }
            jsonPath("$[0].points.live") { value(5) }
        }
    }

    @Test
    fun `withheld live points are absent from the payload, not merely unrendered`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(User(id = alice, githubId = 1L, githubLogin = "amy"))
        every { points.standings(community.id!!, uid, any()) } returns
            mapOf(alice to MemberPoints(stable = 3, live = null))

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].points.live") { doesNotExist() }
        }
    }

    @Test
    fun `equal points fall back to join order, then to a stable id tiebreak`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 0, live = null),
            bob to MemberPoints(stable = 0, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].shortName") { value("AMY") } // joined first
        }
    }

    @Test
    fun `a member without a profile colour still gets one`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns
            listOf(User(id = alice, githubId = 1L, githubLogin = "amy", bgColorHex = null))
        every { points.standings(community.id!!, uid, any()) } returns
            mapOf(alice to MemberPoints(stable = 0, live = null))

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].bgColorHex") { value(org.hamcrest.Matchers.matchesRegex("#[0-9a-f]{6}")) }
        }
    }
}
