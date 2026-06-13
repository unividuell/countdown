package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.MembershipService
import org.unividuell.countdown.core.community.internal.SelectionService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityQueryServiceTest(
    @Autowired val query: CommunityQuery,
    @Autowired val membershipQuery: MembershipQuery,
    @Autowired val selection: SelectionService,
    @Autowired val communityService: CommunityService,
    @Autowired val membership: MembershipService,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String) = users.save(User(githubId = System.nanoTime(), githubLogin = login))

    @Test
    fun `query + membership reflect active communities and admin status`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        query.findBySlug("team")!!.id shouldBe c.id
        membershipQuery.isActiveMember(c.id!!, admin.id!!) shouldBe true
        membershipQuery.isAdmin(c.id!!, admin.id!!) shouldBe true
        membershipQuery.activeCommunitiesOf(admin.id!!) shouldHaveSize 1
    }

    @Test
    fun `pending member is not active`() {
        val admin = user("admin"); val c = communityService.create(admin.id!!, "Team")
        val p = user("p"); membership.accept(membership.generateInvite(c.id!!).token, p.id!!)
        membershipQuery.isActiveMember(c.id!!, p.id!!) shouldBe false
        membershipQuery.activeCommunitiesOf(p.id!!) shouldHaveSize 0
    }

    @Test
    fun `selection round-trips`() {
        val u = user("u"); val c = communityService.create(u.id!!, "Team")
        selection.set(u.id!!, c.id!!)
        selection.get(u.id!!) shouldBe c.id
    }
}
