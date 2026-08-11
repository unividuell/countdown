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
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionService
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
    @Autowired val editions: EditionService,
    @Autowired val editionRepository: CommunityEditionRepository,
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
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "No Start Yet")
        val res = countdown.forSlug(c.slug, ownerId, false)
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
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "Has Start")
        communities.update(
            c, name = null, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null,
            gamesFromRound = null, gamesUntilRound = null,
        )
        val res = countdown.forSlug(c.slug, ownerId, false)
        val round = res.round!!; val nextRound = res.nextRound!!
        (round.number > 0) shouldBe true
        nextRound.number shouldBe round.number - 1
        nextRound.start shouldBe round.end
    }

    @Test
    fun `forSlug follows the active edition when a new run starts`() {
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "Second Run")
        communities.update(
            c, name = null, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "Europe/Berlin", phaseTwoStartRound = null,
            gamesFromRound = null, gamesUntilRound = null,
        )

        editions.startNew(requireNotNull(c.id), "Run 2100")

        // The new run has no date yet, so there is no round — the old run's date is not consulted.
        val res = countdown.forSlug(c.slug, ownerId, false)
        res.startsAt.shouldBeNull()
        res.round.shouldBeNull()
    }

    @Test
    fun `forSlug degrades gracefully when the active edition was archived without a replacement`() {
        val ownerId = aUser().id!!
        val c = communities.create(ownerId, "Broken Invariant")
        val communityId = requireNotNull(c.id)
        // Bypasses EditionService.startNew on purpose: this is the "no active edition" invariant
        // violation that requireActive() would 500 on, reached here through the graceful reader.
        val active = requireNotNull(editionRepository.findActiveByCommunityId(communityId))
        editionRepository.save(active.copy(archivedAt = Instant.parse("2026-08-11T00:00:00Z")))

        val res = countdown.forSlug(c.slug, ownerId, false)

        res.startsAt.shouldBeNull()
        res.round.shouldBeNull()
        res.nextRound.shouldBeNull()
        res.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
    }
}
