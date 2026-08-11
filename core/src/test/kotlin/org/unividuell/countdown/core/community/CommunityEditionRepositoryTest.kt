package org.unividuell.countdown.core.community

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrow
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityEditionRepositoryTest(
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aCommunity(slug: String): UUID {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        val c = communities.save(Community(name = slug, slug = slug, createdBy = creator.id!!))
        return requireNotNull(c.id)
    }

    @Test
    fun `saves an edition with a uuid v7 id and finds the active one`() {
        val communityId = aCommunity("edition-basics")

        val saved = editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        saved.id.shouldNotBeNull().version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        saved.startsAtTimezone shouldBe "Europe/Berlin"
        saved.gamesUntilRound shouldBe 0
        saved.gamesFromRound.shouldBeNull()

        val active = editions.findActiveByCommunityId(communityId).shouldNotBeNull()
        active.label shouldBe "Run 2026"
    }

    @Test
    fun `an archived edition is no longer the active one`() {
        val communityId = aCommunity("edition-archived")
        val first = editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        editions.save(first.copy(archivedAt = Instant.parse("2026-08-11T00:00:00Z")))

        editions.findActiveByCommunityId(communityId).shouldBeNull()
    }

    @Test
    fun `findAllActive returns one row per community and skips archived ones`() {
        val a = aCommunity("edition-active-a")
        val b = aCommunity("edition-active-b")
        editions.save(CommunityEdition(communityId = a, label = "A 2026"))
        val old = editions.save(CommunityEdition(communityId = b, label = "B 2025"))
        editions.save(old.copy(archivedAt = Instant.parse("2026-01-01T00:00:00Z")))
        editions.save(CommunityEdition(communityId = b, label = "B 2026"))

        val active = editions.findAllActive()

        active shouldHaveSize 2
        active.map { it.label }.toSet() shouldBe setOf("A 2026", "B 2026")
    }

    // The constraint violation marks THIS test's transaction rollback-only, so the test asserts the
    // throw and queries nothing afterwards. Neighbouring tests are unaffected — each @Test in a
    // @Transactional Spring test runs in its own transaction and rolls back on its own.
    @Test
    fun `a second active edition for the same community is rejected`() {
        val communityId = aCommunity("edition-only-one-active")
        editions.save(CommunityEdition(communityId = communityId, label = "Run 2026"))

        shouldThrow<DuplicateKeyException> {
            editions.save(CommunityEdition(communityId = communityId, label = "Run 2027"))
        }
    }

    // Same rollback-only caveat as above: assert the throw, query nothing afterwards.
    @Test
    fun `a window whose first round is later than its last is rejected`() {
        val communityId = aCommunity("edition-window-inverted")

        // A larger round number is earlier in time, so from=5 with until=10 would end before it
        // begins — the CHECK constraint, not just the service-level validation, rejects it.
        shouldThrow<DataIntegrityViolationException> {
            editions.save(
                CommunityEdition(
                    communityId = communityId, label = "Run 2026",
                    gamesFromRound = 5, gamesUntilRound = 10,
                )
            )
        }
    }
}
