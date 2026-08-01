package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MembershipServiceAdminTest(
    @Autowired val service: MembershipService,
    @Autowired val communityService: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `approve flips PENDING to ACTIVE`() {
        val adminId = user("admin").id!!; val cid = communityService.create(adminId, "Team").id!!
        val joinerId = user("joiner").id!!
        service.accept(service.generateInvite(cid).token, joinerId)
        service.approve(cid, joinerId)
        members.findByCommunityIdAndUserId(cid, joinerId)!!.status shouldBe MemberStatus.ACTIVE
    }

    @Test
    fun `promote and demote toggle is_admin`() {
        val adminId = user("admin").id!!; val cid = communityService.create(adminId, "Team").id!!
        val pid = user("player").id!!; service.accept(service.generateInvite(cid).token, pid); service.approve(cid, pid)
        service.promote(cid, pid)
        members.findByCommunityIdAndUserId(cid, pid)!!.isAdmin shouldBe true
        service.demote(cid, pid)
        members.findByCommunityIdAndUserId(cid, pid)!!.isAdmin shouldBe false
    }

    @Test
    fun `cannot demote, remove or leave the last admin`() {
        val adminId = user("admin").id!!; val cid = communityService.create(adminId, "Team").id!!
        shouldThrow<LastAdminException> { service.demote(cid, adminId) }
        shouldThrow<LastAdminException> { service.remove(cid, adminId) }
        shouldThrow<LastAdminException> { service.leave(cid, adminId) }
    }
}
