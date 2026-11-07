package org.unividuell.countdown.core.countdown

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.anEdition
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
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
    @Autowired val editionRepository: CommunityEditionRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(subject = System.nanoTime().toString(), githubLogin = "creator"))

    @Test
    fun `forSlug 404s a non-member`() {
        val owner = aUser()
        val c = communities.create(creatorUserId = owner.id!!, rawName = "Members Only")
        val outsider = aUser()
        shouldThrow<CountdownAccessDeniedException> { countdown.forSlug(slug = c.slug, userId = outsider.id!!, isSuperAdmin = false) }
    }

    @Test
    fun `forSlug lets a super-admin see a community they do not belong to`() {
        val owner = aUser()
        val c = communities.create(creatorUserId = owner.id!!, rawName = "Super Visible")
        val superAdmin = aUser()
        val res = countdown.forSlug(slug = c.slug, userId = superAdmin.id!!, isSuperAdmin = true)
        res.targetTimezone shouldBe "Europe/Berlin"
    }

    @Test
    fun `forSlug exposes current and next round when configured`() {
        val ownerId = aUser().id!!
        val c = communities.create(creatorUserId = ownerId, rawName = "Has Start")
        editionRepository.save(
            anEdition(
                communityId = requireNotNull(c.id),
                targetAt = Instant.parse("2099-01-01T10:00:00Z"),
                targetTimezone = "Europe/Berlin",
                gamesFromRound = -36500,
            ),
        )
        val res = countdown.forSlug(slug = c.slug, userId = ownerId, isSuperAdmin = false)
        val round = res.round!!; val nextRound = res.nextRound!!
        (round.number < 0) shouldBe true
        nextRound.number shouldBe round.number + 1
        nextRound.start shouldBe round.end
    }

    @Test
    fun `forSlug shows no date for a community whose only edition is archived`() {
        val ownerId = aUser().id!!
        val c = communities.create(creatorUserId = ownerId, rawName = "Archived Only")
        val communityId = requireNotNull(c.id)
        editionRepository.save(
            anEdition(communityId = communityId).copy(archivedAt = Instant.parse("2026-08-11T00:00:00Z")),
        )

        val res = countdown.forSlug(slug = c.slug, userId = ownerId, isSuperAdmin = false)

        res.targetAt.shouldBeNull()
        res.round.shouldBeNull()
        res.nextRound.shouldBeNull()
        res.targetTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
    }

    @Test
    fun `forSlug shows no date for a community that never had an edition`() {
        val ownerId = aUser().id!!
        val c = communities.create(creatorUserId = ownerId, rawName = "Never Had One")

        val res = countdown.forSlug(slug = c.slug, userId = ownerId, isSuperAdmin = false)

        res.targetAt.shouldBeNull()
        res.round.shouldBeNull()
        res.nextRound.shouldBeNull()
        res.targetTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
    }
}
