package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.SlugUnavailableException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityServiceTest(
    @Autowired val service: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    @Test
    fun `create derives slug and makes the creator an active admin`() {
        val creator = aUser()
        val c = service.create(creator.id!!, "Hütte Hütte")
        c.slug shouldBe "huette-huette"
        val m = members.findByCommunityIdAndUserId(c.id!!, creator.id!!)!!
        m.status shouldBe MemberStatus.ACTIVE
        m.isAdmin shouldBe true
    }

    @Test
    fun `create rejects a name shorter than 3 chars`() {
        shouldThrow<IllegalArgumentException> { service.create(aUser().id!!, "ab") }
    }

    @Test
    fun `create rejects a duplicate slug`() {
        val u = aUser()
        service.create(u.id!!, "Team A")
        shouldThrow<SlugUnavailableException> { service.create(u.id!!, "team a") }
    }

    @Test
    fun `create rejects a reserved slug`() {
        shouldThrow<SlugUnavailableException> { service.create(aUser().id!!, "join") }
    }
}
