package org.unividuell.countdown.core.countdown

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.internal.CountdownAccessDeniedException
import org.unividuell.countdown.core.countdown.internal.CountdownService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CountdownServiceTest(
    @Autowired val countdown: CountdownService,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    @Test
    fun `forSlug 404s a non-member`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "Members Only")
        val outsider = aUser()
        shouldThrow<CountdownAccessDeniedException> { countdown.forSlug(c.slug, outsider.id!!, false) }
    }

    @Test
    fun `forSlug returns null rounds when startsAt unset`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "No Start Yet")
        val res = countdown.forSlug(c.slug, owner.id!!, false)
        res.round shouldBe null
        res.nextRound shouldBe null
        res.startsAtTimezone shouldBe "Europe/Berlin"
    }

    @Test
    fun `forSlug lets a super-admin see a community they do not belong to`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "Super Visible")
        val superAdmin = aUser()
        val res = countdown.forSlug(c.slug, superAdmin.id!!, isSuperAdmin = true)
        res.startsAtTimezone shouldBe "Europe/Berlin"
    }

    @Test
    fun `forSlug exposes current and next round when configured`() {
        val owner = aUser()
        val c = communities.create(owner.id!!, "Has Start")
        communities.update(c, name = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null)
        val res = countdown.forSlug(c.slug, owner.id!!, false)
        (res.round!!.number > 0) shouldBe true
        res.nextRound!!.number shouldBe res.round!!.number - 1
        res.nextRound!!.start shouldBe res.round!!.end
    }
}
