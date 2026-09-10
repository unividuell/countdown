package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.imagepool.internal.ImagePoolAccessDeniedException
import org.unividuell.countdown.core.imagepool.internal.ImagePoolGate
import java.util.UUID
import kotlin.test.assertFailsWith

/**
 * ImagePoolGate is the module's whole access control. ImagePoolServiceTest builds PoolContext by
 * hand and never calls the gate, so these are the only tests exercising its branches.
 */
class ImagePoolGateTest {

    // Neither mock is relaxed: an unstubbed call throws, which is how "the super-admin path
    // never asks membership" gets proven below without a verify {}.
    private val communities = mockk<CommunityQuery>()
    private val memberships = mockk<MembershipQuery>()
    private val gate = ImagePoolGate(communities = communities, memberships = memberships)

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val userId = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")

    private fun community(id: UUID = communityId, slug: String = "known") = Community(
        id = id, name = "Known", slug = slug, createdBy = UUID.randomUUID(),
    )

    /**
     * Both must throw the exact same exception type: a caller who doesn't already know a
     * community exists must not learn it from which failure comes back.
     */
    @Test
    fun `an unknown slug and a non-member are both refused with the same exception`() {
        every { communities.findBySlug("ghost") } returns null
        assertFailsWith<ImagePoolAccessDeniedException> {
            gate.forCommunity(slug = "ghost", userId = userId, isSuperAdmin = false)
        }

        every { communities.findBySlug("known") } returns community()
        every { memberships.isActiveMember(communityId = communityId, userId = userId) } returns false
        assertFailsWith<ImagePoolAccessDeniedException> {
            gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
        }
    }

    @Test
    fun `a super-admin is admitted without being a member`() {
        every { communities.findBySlug("known") } returns community()

        val pool = gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = true)

        pool.communityId shouldBe communityId
        pool.viewerIsAdmin shouldBe true
    }

    @Test
    fun `isAdmin propagates into viewerIsAdmin, not a fixed value`() {
        every { communities.findBySlug("known") } returns community()
        every { memberships.isActiveMember(communityId = communityId, userId = userId) } returns true

        every { memberships.isAdmin(communityId = communityId, userId = userId) } returns true
        gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
            .viewerIsAdmin shouldBe true

        every { memberships.isAdmin(communityId = communityId, userId = userId) } returns false
        gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
            .viewerIsAdmin shouldBe false
    }

    @Test
    fun `global admits only a super-admin, and hands back no community`() {
        val pool = gate.global(true)

        pool.communityId.shouldBeNull()
        pool.viewerIsAdmin shouldBe true

        assertFailsWith<ImagePoolAccessDeniedException> {
            gate.global(false)
        }
    }
}
