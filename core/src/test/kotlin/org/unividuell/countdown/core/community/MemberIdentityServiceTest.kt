package org.unividuell.countdown.core.community

import io.kotest.matchers.maps.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.MemberIdentityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

class MemberIdentityServiceTest {
    private val cid = UUID.fromString("0190f1b2-0000-7000-8000-0000000000c1")
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")

    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val service = MemberIdentityService(members = members, users = users)

    private fun member(userId: UUID, displayName: String? = null, bgColorHex: String? = null) =
        CommunityMember(
            communityId = cid, userId = userId, status = MemberStatus.ACTIVE,
            displayName = displayName, bgColorHex = bgColorHex,
        )

    @Test
    fun `resolves each member against their own membership row`() {
        every { members.findByCommunityId(cid) } returns listOf(
            member(alice, displayName = "Zwerg"),
            member(bob),
        )
        every { users.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )

        val identities = service.of(communityId = cid, userIds = listOf(alice, bob))

        identities shouldHaveSize 2
        identities[alice]!!.username shouldBe "Zwerg"
        identities[bob]!!.username shouldBe "Bender"
    }

    @Test
    fun `a user without a membership row here falls back to their global identity`() {
        every { members.findByCommunityId(cid) } returns emptyList()
        every { users.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
        )

        service.of(communityId = cid, userIds = listOf(alice))[alice]!!.username shouldBe "Amy Wong"
    }

    @Test
    fun `the single lookup answers null for a user with no user row`() {
        every { members.findByCommunityId(cid) } returns listOf(member(alice))
        every { users.findAllById(any()) } returns emptyList()

        service.of(communityId = cid, userId = alice).shouldBeNull()
    }

    @Test
    fun `an empty request asks the database nothing`() {
        service.of(communityId = cid, userIds = emptyList()) shouldHaveSize 0
    }
}
