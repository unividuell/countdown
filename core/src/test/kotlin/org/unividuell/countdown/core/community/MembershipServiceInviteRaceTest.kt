package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.MembershipService
import java.util.Optional
import java.util.UUID

class MembershipServiceInviteRaceTest {

    // Simulates a concurrent draw landing on the same code: the first save hits the
    // UNIQUE constraint, the retry with a fresh candidate succeeds.
    @Test
    fun `generateInvite retries past a code collision instead of failing`() {
        val communityId = UUID.randomUUID()
        val community = Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())

        val communities = mockk<CommunityRepository>()
        every { communities.findById(communityId) } returns Optional.of(community)
        var attempt = 0
        every { communities.save(match { it.inviteToken != null }) } answers {
            attempt++
            if (attempt == 1) throw DuplicateKeyException("duplicate invite_token")
            firstArg()
        }

        val service = MembershipService(communities, mockk<CommunityMemberRepository>())

        val info = service.generateInvite(communityId)

        info.token.length shouldBe 6
        verify(exactly = 2) { communities.save(match { it.inviteToken != null }) }
    }
}
