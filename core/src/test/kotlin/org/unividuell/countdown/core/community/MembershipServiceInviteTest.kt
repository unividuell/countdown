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
        val cid = communityService.create(user("admin").id!!, "Team").id!!
        val first = service.generateInvite(cid)
        first.expiresAt.isAfter(Instant.now().plus(6, ChronoUnit.DAYS)) shouldBe true
        val second = service.generateInvite(cid)
        (second.token != first.token) shouldBe true
        communities.findByInviteToken(first.token) shouldBe null
    }

    @Test
    fun `accept creates a PENDING membership`() {
        val cid = communityService.create(user("admin").id!!, "Team").id!!
        val token = service.generateInvite(cid).token
        val joinerId = user("joiner").id!!
        val result = service.accept(token, joinerId)
        result.shouldBeInstanceOf<AcceptResult.JoinedPending>()
        members.findByCommunityIdAndUserId(cid, joinerId)!!.status shouldBe MemberStatus.PENDING
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

    @Test
    fun `generated codes are six characters long`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        service.generateInvite(cid).token.length shouldBe 6
    }

    @Test
    fun `accept finds the invite from a lower-cased and mistyped code`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        // what a typist produces from a code read aloud: lower case, and O/I for 0/1
        val mistyped = code.lowercase().replace(oldChar = '0', newChar = 'O').replace(oldChar = '1', newChar = 'l')
        service.accept(token = mistyped, userId = user("joiner").id!!).shouldBeInstanceOf<AcceptResult.JoinedPending>()
    }

    @Test
    fun `a legacy long token still resolves verbatim`() {
        val c = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team")
        val legacy = "NHsgFS5e3wlKFhSdSGSQ4U2aNjjBlECa5bhGsmIsic0"
        communities.save(
            communities.findBySlug("team")!!
                .copy(inviteToken = legacy, inviteTokenExpiresAt = Instant.now().plus(1, ChronoUnit.DAYS)),
        )
        service.accept(token = legacy, userId = user("joiner").id!!).shouldBeInstanceOf<AcceptResult.JoinedPending>()
        c.id!! shouldBe communities.findByInviteToken(legacy)!!.id
    }

    @Test
    fun `peek returns the community and reports why a code fails`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        service.peek(code).name shouldBe "Team"
        shouldThrow<InviteNotFoundException> { service.peek("ZZZZZZ") }
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        shouldThrow<InviteExpiredException> { service.peek(code) }
    }

    @Test
    fun `communityOfValidInvite is null for an unknown and for an expired code`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        service.communityOfValidInvite(code)!!.name shouldBe "Team"
        service.communityOfValidInvite("ZZZZZZ") shouldBe null
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        service.communityOfValidInvite(code) shouldBe null
    }
}
