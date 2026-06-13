package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityMemberRepositoryTest(
    @Autowired val members: CommunityMemberRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `stores membership and queries by community, user and admin count`() {
        val u = users.save(User(githubId = 2L, githubLogin = "u2"))
        val c = communities.save(Community(name = "Team", slug = "team", createdBy = u.id!!))
        members.save(CommunityMember(communityId = c.id!!, userId = u.id!!, status = MemberStatus.ACTIVE, isAdmin = true))

        members.findByCommunityId(c.id!!) shouldHaveSize 1
        members.findByCommunityIdAndUserId(c.id!!, u.id!!)!!.isAdmin shouldBe true
        members.countActiveAdmins(c.id!!) shouldBe 1
        members.findActiveByUserId(u.id!!) shouldHaveSize 1
    }

    @Test
    fun `counts pending members`() {
        val admin = users.save(User(githubId = System.nanoTime(), githubLogin = "a"))
        val c = communities.save(Community(name = "Team", slug = "team-pc", createdBy = admin.id!!))
        members.save(CommunityMember(communityId = c.id!!, userId = admin.id!!, status = MemberStatus.ACTIVE, isAdmin = true))
        val p = users.save(User(githubId = System.nanoTime(), githubLogin = "p"))
        members.save(CommunityMember(communityId = c.id!!, userId = p.id!!, status = MemberStatus.PENDING))
        members.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING) shouldBe 1
        members.countByCommunityIdAndStatus(c.id!!, MemberStatus.ACTIVE) shouldBe 1
    }
}
