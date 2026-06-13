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
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val joiner = user("joiner")
        service.accept(service.generateInvite(c.id!!).token, joiner.id!!)
        service.approve(c.id!!, joiner.id!!)
        members.findByCommunityIdAndUserId(c.id!!, joiner.id!!)!!.status shouldBe MemberStatus.ACTIVE
    }

    @Test
    fun `promote and demote toggle is_admin`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val p = user("player"); service.accept(service.generateInvite(c.id!!).token, p.id!!); service.approve(c.id!!, p.id!!)
        service.promote(c.id!!, p.id!!)
        members.findByCommunityIdAndUserId(c.id!!, p.id!!)!!.isAdmin shouldBe true
        service.demote(c.id!!, p.id!!)
        members.findByCommunityIdAndUserId(c.id!!, p.id!!)!!.isAdmin shouldBe false
    }

    @Test
    fun `cannot demote, remove or leave the last admin`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        shouldThrow<LastAdminException> { service.demote(c.id!!, admin.id!!) }
        shouldThrow<LastAdminException> { service.remove(c.id!!, admin.id!!) }
        shouldThrow<LastAdminException> { service.leave(c.id!!, admin.id!!) }
    }
}
