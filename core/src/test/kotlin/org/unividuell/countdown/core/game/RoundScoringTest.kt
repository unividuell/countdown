package org.unividuell.countdown.core.game

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
import org.unividuell.countdown.core.game.internal.Award
import org.unividuell.countdown.core.game.internal.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundScoring
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundScoringTest(
    @Autowired val scoring: RoundScoring,
    @Autowired val plays: RoundPlayRepository,
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

    private fun pointsOf(round: RoundGame, user: UUID): Int? =
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)
            .shouldNotBeNull().points

    @Test
    fun `phase one writes a point for every hit and a zero for every miss`() {
        val round = aRound("sc-phase-one", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val hit = aUser()
        val miss = aUser()
        guessed(round = round, user = hit, qualifies = true, deviation = 4.0, at = at)
        guessed(round = round, user = miss, qualifies = false, deviation = 40.0, at = at.plusSeconds(60))

        scoring.reevaluate(round) shouldBe 2

        pointsOf(round = round, user = hit) shouldBe 1
        pointsOf(round = round, user = miss) shouldBe 0
    }

    @Test
    fun `a later, better guess takes the previous best its points`() {
        // The regression this whole design exists for: a guess writes *other* players' rows, and it
        // does so by evaluating the round again rather than by subtracting from somebody.
        val round = aRound("sc-taken", Award(rule = AwardRule.CLOSEST_ONLY, points = 7))
        val early = aUser()
        val late = aUser()
        guessed(round = round, user = early, qualifies = true, deviation = 12.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = early) shouldBe 7

        guessed(round = round, user = late, qualifies = true, deviation = 3.0, at = at.plusSeconds(60))
        scoring.reevaluate(round)

        pointsOf(round = round, user = early) shouldBe 0
        pointsOf(round = round, user = late) shouldBe 7
    }

    @Test
    fun `re-evaluating without a new guess writes nothing`() {
        // Idempotent because it is a function of stored values: no state that can drift.
        val round = aRound("sc-idempotent", Award(rule = AwardRule.CLOSEST_ONLY, points = 5))
        guessed(round = round, user = aUser(), qualifies = true, deviation = 1.0, at = at)
        scoring.reevaluate(round)

        scoring.reevaluate(round) shouldBe 0
    }

    @Test
    fun `a revealed but unguessed row keeps its null points`() {
        val round = aRound("sc-unguessed", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val lurker = aUser()
        plays.revealOrCount(roundGameId = requireNotNull(round.id), userId = lurker, revealedAt = at)

        scoring.reevaluate(round) shouldBe 0

        // null, not 0: "has not guessed" and "guessed and came away empty" must stay distinguishable.
        pointsOf(round = round, user = lurker) shouldBe null
    }
}
