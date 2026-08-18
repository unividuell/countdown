package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MemberProfilePreviewParityTest(
    @Autowired val profiles: MemberProfileService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {

    @Test
    fun `the preview is exactly what saving the same values produces`() {
        val uid = users.save(
            User(githubId = System.nanoTime(), githubLogin = "amy", displayName = "Amy Wong")
        ).id!!
        val cid = communities.save(
            Community(name = "Team", slug = "team-parity", createdBy = uid)
        ).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE))

        val previewed = profiles.preview(
            userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )
        val saved = profiles.put(
            communityId = cid, userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )

        previewed shouldBe saved.identity
    }

    @Test
    fun `a preview leaves the membership row untouched`() {
        val uid = users.save(
            User(githubId = System.nanoTime(), githubLogin = "bender")
        ).id!!
        val cid = communities.save(
            Community(name = "Team", slug = "team-untouched", createdBy = uid)
        ).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE))

        profiles.preview(userId = uid, displayName = "Zwerg", bgColorHex = "#8e44ad")

        val row = members.findByCommunityIdAndUserId(communityId = cid, userId = uid)!!
        row.displayName shouldBe null
        row.bgColorHex shouldBe null
    }
}
