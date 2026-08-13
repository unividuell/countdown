package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayRepositoryTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val revealedAt = Instant.parse("2026-08-12T10:00:00Z")
    private val guessedAt = Instant.parse("2026-08-12T10:05:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String, roundNumber: Int = 12): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition,
            roundNumber = roundNumber,
            gameType = "guess-hue",
            params = json("""{"hue":42.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = revealedAt,
        )
    }

    @Test
    fun `revealing creates the row with the clock running and nothing guessed`() {
        val round = aRound("rp-reveal")
        val roundId = requireNotNull(round.id)
        val user = aUser()

        plays.revealOrCount(
            roundGameId = roundId, userId = user, revealedAt = revealedAt,
        ) shouldBe 1

        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull()
        play.revealedAt shouldBe revealedAt
        play.revealCount shouldBe 1
        play.guess.shouldBeNull()
        play.guessedAt.shouldBeNull()
        play.points.shouldBeNull()
    }

    @Test
    fun `revealing again counts up and leaves the first timestamp alone`() {
        val round = aRound("rp-again")
        val roundId = requireNotNull(round.id)
        val user = aUser()
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = revealedAt)

        // A refresh must not restart the clock — that timestamp is the round's only time evidence.
        plays.revealOrCount(
            roundGameId = roundId,
            userId = user,
            revealedAt = revealedAt.plusSeconds(600),
        )

        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull()
        play.revealedAt shouldBe revealedAt
        play.revealCount shouldBe 2
        plays.findByRoundGameId(roundId) shouldHaveSize 1
    }

    @Test
    fun `recording a guess stores the tree and the verdict`() {
        val round = aRound("rp-guess")
        val roundId = requireNotNull(round.id)
        val user = aUser()
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = revealedAt)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull()

        plays.recordGuess(
            id = requireNotNull(play.id),
            guess = json("""{"hue":123.5}"""),
            guessedAt = guessedAt,
            qualifies = true,
            deviation = 4.25,
            outcome = json("""{"deviationDeg":4.25}"""),
        ) shouldBe 1

        val stored = plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull()
        stored.guess shouldBe json("""{"hue":123.5}""")
        stored.guessedAt shouldBe guessedAt
        stored.qualifies shouldBe true
        stored.deviation shouldBe 4.25
        stored.outcome shouldBe json("""{"deviationDeg":4.25}""")
        // Still null: the points come from the round's re-evaluation, not from this statement.
        stored.points.shouldBeNull()
    }

    @Test
    fun `a game without an outcome stores SQL NULL rather than a json null`() {
        // A game that validates without saying anything about the guess is allowed — and `outcome`
        // has to end up as SQL NULL, not as the jsonb value 'null', or "has an outcome" would be
        // true for it.
        val round = aRound("rp-no-outcome")
        val roundId = requireNotNull(round.id)
        val user = aUser()
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = revealedAt)
        val play = plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull()

        plays.recordGuess(
            id = requireNotNull(play.id), guess = json("""{"hue":1.0}"""), guessedAt = guessedAt,
            qualifies = false, deviation = 180.0, outcome = null,
        ) shouldBe 1

        plays.findByRoundGameIdAndUserId(
            roundGameId = roundId, userId = user,
        ).shouldNotBeNull().outcome.shouldBeNull()
    }

    @Test
    fun `a second guess changes nothing and reports zero rows`() {
        val round = aRound("rp-second")
        val roundId = requireNotNull(round.id)
        val user = aUser()
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = revealedAt)
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user),
        )
        val playId = requireNotNull(play.id)
        plays.recordGuess(
            id = playId, guess = json("""{"hue":10.0}"""), guessedAt = guessedAt,
            qualifies = true, deviation = 1.0, outcome = null,
        )

        val again = plays.recordGuess(
            id = playId, guess = json("""{"hue":20.0}"""),
            guessedAt = guessedAt.plusSeconds(60), qualifies = true, deviation = 0.5, outcome = null,
        )

        again shouldBe 0
        val stored = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user),
        )
        stored.guess shouldBe json("""{"hue":10.0}""")
        stored.deviation shouldBe 1.0
    }

    @Test
    fun `two players of the same round each get their own row`() {
        val round = aRound("rp-two-players")
        val roundId = requireNotNull(round.id)
        val first = aUser()
        val second = aUser()

        plays.revealOrCount(roundGameId = roundId, userId = first, revealedAt = revealedAt)
        plays.revealOrCount(roundGameId = roundId, userId = second, revealedAt = revealedAt)

        plays.findByRoundGameId(roundId) shouldHaveSize 2
    }

    @Test
    fun `the same player in two rounds gets two rows`() {
        val round = aRound(slug = "rp-two-rounds", roundNumber = 12)
        val roundId = requireNotNull(round.id)
        val edition = requireNotNull(editions.findById(round.editionId).orElse(null))
        val other = store.announce(
            edition = edition, roundNumber = 11, gameType = "guess-hue",
            params = json("""{"hue":7.0}"""), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = revealedAt,
        )
        val otherId = requireNotNull(other.id)
        val user = aUser()

        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = revealedAt)
        plays.revealOrCount(roundGameId = otherId, userId = user, revealedAt = revealedAt)

        plays.findByRoundGameId(roundId) shouldHaveSize 1
        plays.findByRoundGameId(otherId) shouldHaveSize 1
    }
}
