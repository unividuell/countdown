package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.RoundPlayVoteRepository
import org.unividuell.countdown.core.game.internal.RoundScoring
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundScoringPeerReviewTest(
    @Autowired val scoring: RoundScoring,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val votes: RoundPlayVoteRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String, award: Award): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition, roundNumber = 12, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":42.0}"""), award = award, announcedAt = at,
        )
    }

    /** Reveal and guess in one step, straight through the repository — no service needed here. */
    private fun guessed(round: RoundGame, user: UUID, qualifies: Boolean, deviation: Double, at: Instant) {
        val roundId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = this.at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        plays.recordGuess(
            id = requireNotNull(play.id), guess = mapper.readTree("""{"hue":${deviation}}"""),
            guessedAt = at, qualifies = qualifies, deviation = deviation, outcome = null,
        )
    }

    /** A vote from a fresh voter — the identity does not matter, only the count and the value. */
    private fun voteOn(play: UUID, value: Vote) {
        votes.castVote(roundPlayId = play, voterUserId = aUser(), value = value, createdAt = at)
    }

    private fun playIdOf(round: RoundGame, user: UUID): UUID = requireNotNull(
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)?.id,
    )

    private fun pointsOf(round: RoundGame, user: UUID): Int? =
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)?.points

    @Test
    fun `a struck tip loses its point and gets it back when the vote turns`() {
        val round = aRound("strike-phase-one", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1

        val play = playIdOf(round = round, user = player)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 0

        voteOn(play = play, value = Vote.CONFIRM)
        voteOn(play = play, value = Vote.CONFIRM)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1
    }

    /**
     * The whole reason peer review is framework arithmetic: striking the fastest tip has to hand
     * the stake to the next one, and taking the strike back has to hand it straight back.
     */
    @Test
    fun `in phase two the second fastest inherits the stake, and returns it`() {
        val round = aRound("strike-phase-two", Award(rule = AwardRule.CLOSEST_ONLY, points = 3))
        val fastest = aUser()
        val second = aUser()
        guessed(round = round, user = fastest, qualifies = true, deviation = 1_000.0, at = at)
        guessed(round = round, user = second, qualifies = true, deviation = 5_000.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 3
        pointsOf(round = round, user = second) shouldBe 0

        val play = playIdOf(round = round, user = fastest)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 0
        pointsOf(round = round, user = second) shouldBe 3

        votes.deleteAll()
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 3
        pointsOf(round = round, user = second) shouldBe 0
    }

    @Test
    fun `the admin override beats the vote in both directions`() {
        val round = aRound("override-scoring", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        val play = playIdOf(round = round, user = player)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)

        plays.updateAdminOverride(id = play, adminOverride = true)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1

        plays.updateAdminOverride(id = play, adminOverride = false)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 0
    }

    /** Every other game keeps behaving exactly as before, because no vote can ever exist for it. */
    @Test
    fun `a round without votes scores exactly as it did before`() {
        val round = aRound("no-votes", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        scoring.reevaluate(round)

        pointsOf(round = round, user = player) shouldBe 1
    }
}
