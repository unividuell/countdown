package org.unividuell.countdown.core.community

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.SuperAdminOverviewService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Instant
import java.util.UUID

/**
 * Pure mockk unit test: the service is assembly only (group, resolve, sort) over stock
 * CrudRepository methods — no custom SQL to prove against Postgres, and the
 * one-batch-lookup guarantee is only observable on a mock.
 */
class SuperAdminOverviewServiceTest {
    private val communities = mockk<CommunityRepository>()
    private val members = mockk<CommunityMemberRepository>()
    private val editions = mockk<CommunityEditionRepository>()
    private val users = mockk<UserQuery>()
    private val service = SuperAdminOverviewService(communities, members, editions, users)

    private val alphaId = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")
    private val zuluId = UUID.fromString("018f0000-0000-7000-8000-0000000000b1")
    private val aliceId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val bobId = UUID.fromString("018f0000-0000-7000-8000-0000000000c2")
    private val ghostId = UUID.fromString("018f0000-0000-7000-8000-0000000000c3")
    private val zoeId = UUID.fromString("018f0000-0000-7000-8000-0000000000c4")

    private fun community(id: UUID, name: String, slug: String) = Community(
        id = id, name = name, slug = slug, createdBy = aliceId,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"),
    )

    private fun member(communityId: UUID, userId: UUID, status: MemberStatus, isAdmin: Boolean) =
        CommunityMember(
            id = UUID.randomUUID(), communityId = communityId, userId = userId,
            status = status, isAdmin = isAdmin, createdAt = Instant.parse("2026-02-01T00:00:00Z"),
        )

    private fun user(id: UUID, login: String, name: String) =
        User(id = id, githubId = id.leastSignificantBits, githubLogin = login, displayName = name)

    @Test
    fun `sorts communities by name and members admins-active-pending, resolving users in one batch`() {
        every { communities.findAll() } returns listOf(
            community(zuluId, "Zulu", "zulu"),
            community(alphaId, "alpha", "alpha"),
        )
        every { members.findAll() } returns listOf(
            member(alphaId, bobId, MemberStatus.PENDING, isAdmin = false),
            // Zoe must precede the ghost row here: sortedWith is stable, so this input order is
            // what makes the username key (not just admin+status) responsible for their order.
            member(alphaId, zoeId, MemberStatus.ACTIVE, isAdmin = false),
            member(alphaId, ghostId, MemberStatus.ACTIVE, isAdmin = false),
            member(alphaId, aliceId, MemberStatus.ACTIVE, isAdmin = true),
            member(zuluId, aliceId, MemberStatus.ACTIVE, isAdmin = true),
        )
        // ghostId is deliberately absent: a membership whose user row is gone must stay visible.
        every { users.findAllById(any()) } returns listOf(
            user(aliceId, "alice", "Alice"),
            user(bobId, "bob", "Bob"),
            user(zoeId, "zoe", "Zoe"),
        )
        every { editions.findAllActive() } returns emptyList()

        val result = service.overview()

        // case-insensitive name order: "alpha" before "Zulu"
        result.map { it.slug } shouldContainExactly listOf("alpha", "zulu")
        result[0].members.map { it.username } shouldContainExactly listOf("Alice", "?", "Zoe", "Bob")
        result[0].members[1].githubLogin shouldBe "?"
        result[0].members[3].status shouldBe "PENDING"
        result[0].members[0].isAdmin shouldBe true
        result[0].members[0].joinedAt shouldBe Instant.parse("2026-02-01T00:00:00Z")
        verify(exactly = 1) { users.findAllById(any()) }
    }

    @Test
    fun `a community without members yields an empty roster`() {
        every { communities.findAll() } returns listOf(community(alphaId, "Alpha", "alpha"))
        every { members.findAll() } returns emptyList()
        every { users.findAllById(emptyList()) } returns emptyList()
        every { editions.findAllActive() } returns emptyList()

        val result = service.overview()

        result shouldHaveSize 1
        result[0].members shouldBe emptyList()
    }

    @Test
    fun `an edition's schedule lands on its own community, a community without one keeps the default`() {
        every { communities.findAll() } returns listOf(
            community(alphaId, "Alpha", "alpha"),
            community(zuluId, "Zulu", "zulu"),
        )
        every { members.findAll() } returns emptyList()
        every { users.findAllById(emptyList()) } returns emptyList()
        // Only alpha has an active edition, with a non-default timezone and a set date: a batch
        // keyed on the wrong column (e.g. the edition's own id) would still pass with defaults.
        every { editions.findAllActive() } returns listOf(
            CommunityEdition(
                id = UUID.randomUUID(), communityId = alphaId, label = "Alpha 2026",
                startsAt = Instant.parse("2026-06-01T00:00:00Z"), startsAtTimezone = "America/New_York",
            ),
        )

        val result = service.overview()

        val alpha = result.first { it.slug == "alpha" }
        alpha.startsAt shouldBe Instant.parse("2026-06-01T00:00:00Z")
        alpha.startsAtTimezone shouldBe "America/New_York"

        // zulu has no active edition — it stays visible with the default rather than vanishing.
        val zulu = result.first { it.slug == "zulu" }
        zulu.startsAt.shouldBeNull()
        zulu.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
    }
}
