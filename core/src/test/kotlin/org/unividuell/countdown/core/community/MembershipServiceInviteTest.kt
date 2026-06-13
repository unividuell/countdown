package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.time.temporal.ChronoUnit

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MembershipServiceInviteTest(
    @Autowired val service: MembershipService,
    @Autowired val communityService: CommunityService,
    @Autowired val communities: CommunityRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `generate produces a token with 7-day expiry and regenerate replaces it`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val first = service.generateInvite(c.id!!)
        first.expiresAt.isAfter(Instant.now().plus(6, ChronoUnit.DAYS)) shouldBe true
        val second = service.generateInvite(c.id!!)
        (second.token != first.token) shouldBe true
        communities.findByInviteToken(first.token) shouldBe null
    }

    @Test
    fun `accept creates a PENDING membership`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val token = service.generateInvite(c.id!!).token
        val joiner = user("joiner")
        val result = service.accept(token, joiner.id!!)
        result.shouldBeInstanceOf<AcceptResult.JoinedPending>()
        members.findByCommunityIdAndUserId(c.id!!, joiner.id!!)!!.status shouldBe MemberStatus.PENDING
    }

    @Test
    fun `accept of an unknown token throws InviteNotFound`() {
        shouldThrow<InviteNotFoundException> { service.accept("nope", user("x").id!!) }
    }

    @Test
    fun `accept of an expired token throws InviteExpired`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val token = service.generateInvite(c.id!!).token
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        shouldThrow<InviteExpiredException> { service.accept(token, user("late").id!!) }
    }
}
