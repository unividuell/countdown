package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.collections.shouldNotContain
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionService
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
    @Autowired val editions: EditionService,
) {
    private fun user(login: String) = users.save(User(subject = System.nanoTime().toString(), githubLogin = login))

    @Test
    fun `query + membership reflect active communities and admin status`() {
        val adminId = user("admin").id!!; val cid = communityService.create(adminId, "Team").id!!
        query.findBySlug("team")!!.id shouldBe cid
        membershipQuery.isActiveMember(cid, adminId) shouldBe true
        membershipQuery.isAdmin(cid, adminId) shouldBe true
        membershipQuery.activeCommunitiesOf(adminId) shouldHaveSize 1
    }

    @Test
    fun `pending member is not active`() {
        val adminId = user("admin").id!!; val cid = communityService.create(adminId, "Team").id!!
        val pid = user("p").id!!; membership.accept(membership.generateInvite(cid).token, pid)
        membershipQuery.isActiveMember(cid, pid) shouldBe false
        membershipQuery.activeCommunitiesOf(pid) shouldHaveSize 0
    }

    @Test
    fun `selection round-trips`() {
        val uid = user("u").id!!; val cid = communityService.create(uid, "Team").id!!
        selection.set(uid, cid)
        selection.get(uid) shouldBe cid
    }

    @Test
    fun `activeEditions lists a community's running edition and not the one it archived`() {
        val uid = user("u").id!!
        val cid = communityService.create(creatorUserId = uid, rawName = "Team").id!!
        val archived = requireNotNull(query.activeEditionOf(cid))
        val running = editions.startNew(communityId = cid, rawLabel = "Run 2027")

        val ids = query.activeEditions().map { it.id }

        ids shouldContain running.id
        ids shouldNotContain archived.id
    }
}
