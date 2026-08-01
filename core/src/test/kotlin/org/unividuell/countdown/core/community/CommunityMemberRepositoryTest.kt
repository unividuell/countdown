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
        val uid = users.save(User(githubId = 2L, githubLogin = "u2")).id!!
        val cid = communities.save(Community(name = "Team", slug = "team", createdBy = uid)).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE, isAdmin = true))

        members.findByCommunityId(cid) shouldHaveSize 1
        members.findByCommunityIdAndUserId(cid, uid)!!.isAdmin shouldBe true
        members.countActiveAdmins(cid) shouldBe 1
        members.findActiveByUserId(uid) shouldHaveSize 1
    }

    @Test
    fun `counts pending members`() {
        val adminId = users.save(User(githubId = System.nanoTime(), githubLogin = "a")).id!!
        val cid = communities.save(Community(name = "Team", slug = "team-pc", createdBy = adminId)).id!!
        members.save(CommunityMember(communityId = cid, userId = adminId, status = MemberStatus.ACTIVE, isAdmin = true))
        val pid = users.save(User(githubId = System.nanoTime(), githubLogin = "p")).id!!
        members.save(CommunityMember(communityId = cid, userId = pid, status = MemberStatus.PENDING))
        members.countByCommunityIdAndStatus(cid, MemberStatus.PENDING) shouldBe 1
        members.countByCommunityIdAndStatus(cid, MemberStatus.ACTIVE) shouldBe 1
    }
}
