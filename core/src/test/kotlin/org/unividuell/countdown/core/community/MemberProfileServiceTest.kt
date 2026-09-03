package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityAccessDeniedException
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

class MemberProfileServiceTest {
    private val cid = UUID.fromString("0190f1b2-0000-7000-8000-0000000000c1")
    private val uid = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")

    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val service = MemberProfileService(members = members, users = users)

    private val user = User(id = uid, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong")
    private val row = CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE)

    @Test
    fun `writing stores both columns normalized and answers with the resulting identity`() {
        every { members.findByCommunityIdAndUserId(communityId = cid, userId = uid) } returns row
        every { users.findById(uid) } returns user
        val saved = slot<CommunityMember>()
        every { members.save(capture(saved)) } answers { saved.captured }

        val result = service.put(
            communityId = cid, userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )

        saved.captured.displayName shouldBe "Zwerg"
        saved.captured.bgColorHex shouldBe "#8e44ad"
        result.identity.username shouldBe "Zwerg"
        result.displayName shouldBe "Zwerg"
    }

    @Test
    fun `clearing nulls both columns`() {
        every { members.findByCommunityIdAndUserId(communityId = cid, userId = uid) } returns
            row.copy(displayName = "Zwerg", bgColorHex = "#8e44ad")
        every { users.findById(uid) } returns user
        val saved = slot<CommunityMember>()
        every { members.save(capture(saved)) } answers { saved.captured }

        val result = service.clear(communityId = cid, userId = uid)

        saved.captured.displayName.shouldBeNull()
        saved.captured.bgColorHex.shouldBeNull()
        result.identity.username shouldBe "Amy Wong"
    }

    @Test
    fun `a caller without a membership row here is refused rather than silently ignored`() {
        every { members.findByCommunityIdAndUserId(communityId = cid, userId = uid) } returns null

        shouldThrow<CommunityAccessDeniedException> {
            service.put(communityId = cid, userId = uid, displayName = "Zwerg", bgColorHex = null)
        }
    }

    @Test
    fun `a name beyond the limit is refused`() {
        every { members.findByCommunityIdAndUserId(communityId = cid, userId = uid) } returns row

        shouldThrow<IllegalArgumentException> {
            service.put(
                communityId = cid, userId = uid, displayName = "x".repeat(33), bgColorHex = null,
            )
        }
    }

    @Test
    fun `the preview resolves candidate values without touching the database`() {
        every { users.findById(uid) } returns user

        val identity = service.preview(
            userId = uid, displayName = "Zwerg", bgColorHex = "#8E44AD",
        )

        identity.username shouldBe "Zwerg"
        identity.avatar.bgColorHex shouldBe "#8e44ad"
    }
}
