package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.EditionArchiver
import org.unividuell.countdown.core.community.internal.EditionNotFoundException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class EditionArchiverTest {
    private val now = Instant.parse("2026-11-26T12:00:00Z")
    private val editions = mockk<CommunityEditionRepository>()
    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val gameData = mockk<EditionGameData>()
    private val archiver = EditionArchiver(
        editions = editions,
        members = members,
        users = users,
        gameData = gameData,
        mapper = JsonMapper.builder().build(),
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )

    private val communityId = UUID.randomUUID()
    private val edition = anEdition(communityId = communityId, id = UUID.randomUUID())

    init {
        every { editions.lockActiveByCommunityId(communityId) } returns edition
        every { editions.save(any()) } answers { firstArg() }
        justRun { gameData.purge(any()) }
    }

    /** A member joined at [joined], with a user named [name] and no community override. */
    private fun aMember(name: String, joined: String, status: MemberStatus = MemberStatus.ACTIVE): CommunityMember {
        val userId = UUID.randomUUID()
        every { users.findAllById(any()) } answers {
            firstArg<Collection<UUID>>().mapNotNull { id -> byUser[id] }
        }
        byUser[userId] = User(id = userId, subject = name, githubLogin = name, displayName = name)

        return CommunityMember(
            communityId = communityId,
            userId = userId,
            status = status,
            createdAt = Instant.parse(joined),
        )
    }

    private val byUser = mutableMapOf<UUID, User>()

    private fun archived(): JsonNode = requireNotNull(archiver.archive(communityId).finalStandings)

    private fun JsonNode.column(field: String): List<Any> =
        (0 until size()).map { i -> get(i).get(field).let { if (it.isNumber) it.asInt() else it.asString() } }

    @Test
    fun `archive ranks active members by points with shared ranks`() {
        val fry = aMember(name = "Fry", joined = "2026-01-01T00:00:00Z")
        val leela = aMember(name = "Leela", joined = "2026-01-02T00:00:00Z")
        val bender = aMember(name = "Bender", joined = "2026-01-03T00:00:00Z")
        val zoidberg = aMember(name = "Zoidberg", joined = "2026-01-04T00:00:00Z", status = MemberStatus.PENDING)
        every { members.findByCommunityId(communityId) } returns listOf(bender, zoidberg, leela, fry)
        every { gameData.finalPoints(edition = edition, userIds = any()) } returns
            mapOf(fry.userId to 12, leela.userId to 12, bender.userId to 5)

        val table = archived()

        table.column("name") shouldBe listOf("Fry", "Leela", "Bender")
        table.column("rank") shouldBe listOf(1, 1, 3)
        table.column("points") shouldBe listOf(12, 12, 5)
        (0 until table.size()).map { table.get(it).has("userId") } shouldBe listOf(false, false, false)
    }

    @Test
    fun `archive keeps roster order on a tie`() {
        val late = aMember(name = "Late", joined = "2026-03-01T00:00:00Z")
        val early = aMember(name = "Early", joined = "2026-02-01T00:00:00Z")
        every { members.findByCommunityId(communityId) } returns listOf(late, early)
        every { gameData.finalPoints(edition = edition, userIds = any()) } returns
            mapOf(late.userId to 3, early.userId to 3)

        archived().column("name") shouldBe listOf("Early", "Late")
    }

    @Test
    fun `archive without any play lists everyone with zero`() {
        val fry = aMember(name = "Fry", joined = "2026-01-01T00:00:00Z")
        val leela = aMember(name = "Leela", joined = "2026-01-02T00:00:00Z")
        every { members.findByCommunityId(communityId) } returns listOf(fry, leela)
        every { gameData.finalPoints(edition = edition, userIds = any()) } returns emptyMap()

        val table = archived()

        table.column("points") shouldBe listOf(0, 0)
        table.column("rank") shouldBe listOf(1, 1)
    }

    @Test
    fun `archive purges game data and stamps archivedAt`() {
        every { members.findByCommunityId(communityId) } returns emptyList()
        every { gameData.finalPoints(edition = edition, userIds = any()) } returns emptyMap()

        val result = archiver.archive(communityId)

        result.archivedAt shouldBe now
        verify { gameData.purge(edition.id!!) }
    }

    @Test
    fun `archive without an active edition throws not found`() {
        every { editions.lockActiveByCommunityId(communityId) } returns null

        shouldThrow<EditionNotFoundException> { archiver.archive(communityId) }

        verify(exactly = 0) { gameData.purge(any()) }
    }
}
