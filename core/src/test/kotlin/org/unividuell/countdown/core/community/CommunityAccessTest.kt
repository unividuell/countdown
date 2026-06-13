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
class CommunityAccessTest(
    @Autowired val access: CommunityAccess,
    @Autowired val communityService: CommunityService,
    @Autowired val membership: MembershipService,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `non-member gets access denied (404 semantics)`() {
        communityService.create(user("admin").id!!, "Team")
        shouldThrow<CommunityAccessDeniedException> { access.requireActiveMember(user("stranger").id!!, false, "team") }
    }

    @Test
    fun `active non-admin can read but not admin`() {
        val c = communityService.create(user("admin").id!!, "Team")
        val p = user("p"); membership.accept(membership.generateInvite(c.id!!).token, p.id!!); membership.approve(c.id!!, p.id!!)
        access.requireActiveMember(p.id!!, false, "team").slug shouldBe "team"
        shouldThrow<NotAdminException> { access.requireAdmin(p.id!!, false, "team") }
    }

    @Test
    fun `super-admin overrides membership and admin`() {
        communityService.create(user("admin").id!!, "Team")
        access.requireAdmin(user("super").id!!, true, "team").slug shouldBe "team"
    }
}
