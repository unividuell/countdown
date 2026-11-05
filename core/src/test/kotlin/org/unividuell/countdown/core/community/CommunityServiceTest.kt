package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityQueryService
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.SlugUnavailableException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityServiceTest(
    @Autowired val service: CommunityService,
    @Autowired val query: CommunityQueryService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(subject = System.nanoTime().toString(), githubLogin = "creator"))

    @Test
    fun `create derives slug and makes the creator an active admin`() {
        val creatorId = aUser().id!!
        val c = service.create(creatorUserId = creatorId, rawName = "Hütte Hütte")
        c.slug shouldBe "huette-huette"
        val m = members.findByCommunityIdAndUserId(communityId = c.id!!, userId = creatorId)!!
        m.status shouldBe MemberStatus.ACTIVE
        m.isAdmin shouldBe true
    }

    @Test
    fun `create rejects a name shorter than 3 chars`() {
        shouldThrow<IllegalArgumentException> { service.create(creatorUserId = aUser().id!!, rawName = "ab") }
    }

    @Test
    fun `create rejects a duplicate slug`() {
        val uid = aUser().id!!
        service.create(creatorUserId = uid, rawName = "Team A")
        shouldThrow<SlugUnavailableException> { service.create(creatorUserId = uid, rawName = "team a") }
    }

    @Test
    fun `create accepts a name whose slug used to be reserved`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Super Admin")
        c.slug shouldBe "super-admin"
    }

    @Test
    fun `create makes no edition`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Hütte 2026")

        query.activeEditionOf(requireNotNull(c.id)).shouldBeNull()
    }

    @Test
    fun `rename changes the name and keeps the slug`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Zone Team")

        val renamed = service.rename(community = c, name = "  Zone Team Renamed ")

        renamed.name shouldBe "Zone Team Renamed"
        renamed.slug shouldBe "zone-team"
    }

    @Test
    fun `rename rejects a name shorter than 3 chars`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Bad Name")

        shouldThrow<IllegalArgumentException> { service.rename(community = c, name = "ab") }
    }
}
