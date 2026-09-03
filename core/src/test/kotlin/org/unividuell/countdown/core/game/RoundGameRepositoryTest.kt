package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.RoundGameRepository
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundGameRepositoryTest(
    @Autowired val rounds: RoundGameRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val announcedAt = Instant.parse("2026-08-12T10:00:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)
    private fun anEdition(slug: String): CommunityEdition {
        val creator = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))
        val community = communities.save(
            Community(name = slug, slug = slug, createdBy = requireNotNull(creator.id)),
        )
        return editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
    }

    @Test
    fun `announce writes the round and find reads it back`() {
        val edition = anEdition("rg-announce")

        val announced = store.announce(
            edition = edition,
            roundNumber = 12,
            gameType = "guess-hue",
            params = json("""{"description":"ein warmes Rot"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = announcedAt,
        )

        announced.id.shouldNotBeNull().version() shouldBe 7
        announced.roundNumber shouldBe 12
        announced.awardRule shouldBe AwardRule.ALL_QUALIFYING
        announced.awardPoints shouldBe 1
        announced.params shouldBe json("""{"description":"ein warmes Rot"}""")

        val found = store.find(edition = edition, roundNumber = 12).shouldNotBeNull()
        found.gameType shouldBe "guess-hue"
        found.announcedAt shouldBe announcedAt
        store.find(edition = edition, roundNumber = 11).shouldBeNull()
    }

    @Test
    fun `announce is idempotent - the second call returns the first round untouched`() {
        val edition = anEdition("rg-idempotent")
        val first = store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = json("""{"n":1}"""), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = announcedAt,
        )

        // A different draw for the same round must not win: ON CONFLICT DO NOTHING, then SELECT.
        val second = store.announce(
            edition = edition, roundNumber = 12, gameType = "other-game",
            params = json("""{"n":2}"""), award = Award(rule = AwardRule.CLOSEST_ONLY, points = 9),
            announcedAt = announcedAt,
        )

        second.id shouldBe first.id
        second.gameType shouldBe "guess-hue"
        second.params shouldBe json("""{"n":1}""")
        second.awardPoints shouldBe 1
        rounds.historyOf(editionId = requireNotNull(edition.id), after = Int.MIN_VALUE) shouldHaveSize 1
    }

    @Test
    fun `history is the rounds earlier in time, most recent first`() {
        val edition = anEdition("rg-history")
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        // Larger number = earlier in time. Round 8 is "now"; 9, 10, 12 came before it, 7 comes after.
        for (n in listOf(12, 10, 9, 8, 7)) {
            store.announce(
                edition = edition, roundNumber = n, gameType = "game-$n",
                params = json("""{"n":$n}"""), award = award, announcedAt = announcedAt,
            )
        }

        val history = store.history(edition = edition, roundNumber = 8)

        // Ascending round_number = most recently played first: 9 is the round before 8.
        history.map { it.roundNumber } shouldContainExactly listOf(9, 10, 12)
        history.first().gameType shouldBe "game-9"
    }

    @Test
    fun `history skips a gap rather than stopping at it`() {
        val edition = anEdition("rg-gap")
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        store.announce(
            edition = edition, roundNumber = 20, gameType = "long-ago",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )

        // Nobody opened rounds 19..9, so they do not exist. Round 20 is still the previous round.
        val history = store.history(edition = edition, roundNumber = 8)

        history.map { it.roundNumber } shouldContainExactly listOf(20)
    }

    @Test
    fun `two editions of the same community keep their own rounds`() {
        val first = anEdition("rg-two-editions")
        val second = editions.save(
            CommunityEdition(
                communityId = first.communityId,
                label = "Run 2027",
                archivedAt = Instant.parse("2027-01-01T00:00:00Z"),
            ),
        )
        val award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
        store.announce(
            edition = first, roundNumber = 5, gameType = "first-run",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )
        store.announce(
            edition = second, roundNumber = 5, gameType = "second-run",
            params = json("""{}"""), award = award, announcedAt = announcedAt,
        )

        store.find(edition = first, roundNumber = 5).shouldNotBeNull().gameType shouldBe "first-run"
        store.find(edition = second, roundNumber = 5).shouldNotBeNull().gameType shouldBe "second-run"
    }

    @Test
    fun `previousRound is the next larger announced round number, skipping gaps`() {
        val edition = anEdition("rg-previous")
        for (roundNumber in listOf(20, 17, 12)) {
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
                params = json("""{"n":$roundNumber}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = announcedAt,
            )
        }

        store.previousRound(edition = edition, roundNumber = 12) shouldBe 17
        // 18 and 19 were never announced; the chain steps over them instead of ending there.
        store.previousRound(edition = edition, roundNumber = 17) shouldBe 20
        store.previousRound(edition = edition, roundNumber = 20).shouldBeNull()
    }

    @Test
    fun `previousRound stops at the run's game window`() {
        val edition = editions.save(anEdition("rg-previous-window").copy(gamesFromRound = 18))
        for (roundNumber in listOf(20, 17)) {
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
                params = json("""{"n":$roundNumber}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = announcedAt,
            )
        }

        // Round 20 lies BEFORE the window — a larger number is earlier — so it is not reachable,
        // exactly as the standings do not sum it.
        store.previousRound(edition = edition, roundNumber = 17).shouldBeNull()
    }

    @Test
    fun `previousRound does not point below the run's game window either`() {
        val edition = editions.save(anEdition("rg-previous-window-younger").copy(gamesUntilRound = 18))
        // Announced while `gamesUntilRound` was lower or absent; the admin has since raised it,
        // leaving this round strictly between the running round and the new lower edge.
        store.announce(
            edition = edition, roundNumber = 15, gameType = "guess-hue",
            params = json("""{"n":15}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = announcedAt,
        )

        // Round 15 lies AFTER the window — a smaller number is later — so it must not be reachable
        // from a round further back either, exactly as the standings do not sum it.
        store.previousRound(edition = edition, roundNumber = 10).shouldBeNull()
    }
}
