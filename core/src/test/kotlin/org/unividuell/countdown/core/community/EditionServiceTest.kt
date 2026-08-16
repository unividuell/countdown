package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.EditionConflictException
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class EditionServiceTest(
    @Autowired val service: EditionService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aCommunity(slug: String): UUID {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        return requireNotNull(communities.save(Community(name = slug, slug = slug, createdBy = creator.id!!)).id)
    }

    @Test
    fun `create makes the first active edition with the defaults`() {
        val communityId = aCommunity("es-create")

        val edition = service.create(communityId = communityId, rawLabel = "  Run 2026  ")

        edition.label shouldBe "Run 2026"
        edition.startsAt.shouldBeNull()
        edition.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
        edition.gamesUntilRound shouldBe 0
        edition.archivedAt.shouldBeNull()
    }

    @Test
    fun `requireActive fails loudly when the invariant is broken`() {
        val communityId = aCommunity("es-no-edition")

        shouldThrow<IllegalStateException> { service.requireActive(communityId) }
    }

    @Test
    fun `update sets a valid IANA timezone and keeps unset fields`() {
        val communityId = aCommunity("es-update")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        val updated = service.update(
            edition, label = null, startsAt = Instant.parse("2099-01-01T10:00:00Z"),
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20,
            gamesFromRound = 24, gamesUntilRound = null,
        )

        updated.label shouldBe "Run 2026"
        updated.startsAtTimezone shouldBe "America/New_York"
        updated.phaseTwoStartRound shouldBe 20
        updated.gamesFromRound shouldBe 24
        updated.gamesUntilRound shouldBe 0
    }

    @Test
    fun `update rejects an invalid timezone`() {
        val communityId = aCommunity("es-bad-zone")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = "Mars/Olympus",
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update rejects a phaseTwoStartRound that is not positive`() {
        val communityId = aCommunity("es-bad-phase")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = 0, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }

    @Test
    fun `update rejects a window whose first round is later than its last`() {
        val communityId = aCommunity("es-bad-window")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        // A larger number is earlier: from=5 with until=10 would end before it begins.
        shouldThrow<IllegalArgumentException> {
            service.update(
                edition, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = 5, gamesUntilRound = 10,
            )
        }
    }

    @Test
    fun `update accepts a negative last round so games can run past the start`() {
        val communityId = aCommunity("es-negative-window")
        val edition = service.create(communityId = communityId, rawLabel = "Run 2026")

        val updated = service.update(
            edition, label = null, startsAt = null, startsAtTimezone = null,
            phaseTwoStartRound = null, gamesFromRound = 24, gamesUntilRound = -3,
        )

        updated.gamesUntilRound shouldBe -3
    }

    @Test
    fun `startNew archives the current edition and inherits its setup`() {
        val communityId = aCommunity("es-start-new")
        val first = service.create(communityId = communityId, rawLabel = "Run 2026")
        service.update(
            first, label = null, startsAt = Instant.parse("2026-10-01T16:00:00Z"),
            startsAtTimezone = "America/New_York", phaseTwoStartRound = 20,
            gamesFromRound = 24, gamesUntilRound = -1,
        )

        val second = service.startNew(communityId = communityId, rawLabel = "Run 2027")

        second.label shouldBe "Run 2027"
        second.startsAt.shouldBeNull()          // the new date is not known yet
        second.startsAtTimezone shouldBe "America/New_York"
        second.phaseTwoStartRound shouldBe 20
        second.gamesFromRound shouldBe 24
        second.gamesUntilRound shouldBe -1

        service.requireActive(communityId).label shouldBe "Run 2027"
        editions.findAllActive().count { it.communityId == communityId } shouldBe 1
        val archived = editions.findAll().single { it.label == "Run 2026" }
        archived.archivedAt.shouldNotBeNull()
    }

    @Test
    fun `create fails with EditionConflictException when trying to insert a second active edition`() {
        val communityId = aCommunity("es-duplicate-active")
        service.create(communityId = communityId, rawLabel = "Run 2026")

        shouldThrow<EditionConflictException> { service.create(communityId = communityId, rawLabel = "Run 2027") }
    }

    @Test
    fun `startNew opens the first edition when the community has none yet`() {
        val communityId = aCommunity("es-start-new-no-current")

        val started = service.startNew(communityId = communityId, rawLabel = "Run 2026")

        started.label shouldBe "Run 2026"
        started.startsAt.shouldBeNull()
        started.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
        started.gamesUntilRound shouldBe 0
        started.archivedAt.shouldBeNull()
        service.requireActive(communityId).label shouldBe "Run 2026"
    }

    // A DuplicateKeyException marks THIS test's transaction rollback-only, so the test asserts the
    // throw and queries nothing afterwards, matching CommunityEditionRepositoryTest's convention.
    @Test
    fun `update conflicts when the edition was archived by a concurrent startNew`() {
        val communityId = aCommunity("es-update-stale")
        val stale = service.create(communityId = communityId, rawLabel = "Run 2026")

        // Simulates admin B's POST .../editions committing between admin A's read and A's update:
        // this archives `stale` and opens a fresh active edition in its place.
        service.startNew(communityId = communityId, rawLabel = "Run 2027")

        shouldThrow<EditionConflictException> {
            service.update(
                stale, label = null, startsAt = null, startsAtTimezone = null,
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }
}
