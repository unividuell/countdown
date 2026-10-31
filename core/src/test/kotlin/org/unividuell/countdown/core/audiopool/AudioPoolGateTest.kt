package org.unividuell.countdown.core.audiopool

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.audiopool.internal.AudioPoolAccessDeniedException
import org.unividuell.countdown.core.audiopool.internal.AudioPoolGate
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

/** AudioPoolGate is the module's whole access control; these tests exercise each of its branches. */
class AudioPoolGateTest {

    // Neither mock is relaxed: an unstubbed call throws, which is how "the super-admin path
    // never asks membership" gets proven below without a verify {}.
    private val communities = mockk<CommunityQuery>()
    private val memberships = mockk<MembershipQuery>()
    private val gate = AudioPoolGate(communities = communities, memberships = memberships)

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
        shouldThrow<AudioPoolAccessDeniedException> {
            gate.forCommunity(slug = "ghost", userId = userId, isSuperAdmin = false)
        }

        every { communities.findBySlug("known") } returns community()
        every { memberships.isActiveMember(communityId = communityId, userId = userId) } returns false
        shouldThrow<AudioPoolAccessDeniedException> {
            gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
        }
    }

    @Test
    fun `a member sees only their own, an admin all`() {
        every { communities.findBySlug("known") } returns community()
        every { memberships.isActiveMember(communityId = communityId, userId = userId) } returns true

        every { memberships.isAdmin(communityId = communityId, userId = userId) } returns false
        gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
            .viewerIsAdmin shouldBe false

        every { memberships.isAdmin(communityId = communityId, userId = userId) } returns true
        gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = false)
            .viewerIsAdmin shouldBe true
    }

    @Test
    fun `a super-admin passes without a membership`() {
        every { communities.findBySlug("known") } returns community()

        val pool = gate.forCommunity(slug = "known", userId = userId, isSuperAdmin = true)

        pool.communityId shouldBe communityId
        pool.viewerIsAdmin shouldBe true
    }

    @Test
    fun `the global pool admits a super-admin and nobody else`() {
        val pool = gate.global(isSuperAdmin = true)

        pool.communityId.shouldBeNull()
        pool.viewerIsAdmin shouldBe true

        shouldThrow<AudioPoolAccessDeniedException> {
            gate.global(isSuperAdmin = false)
        }
    }
}
