package org.unividuell.countdown.core.game

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
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayStageRepositoryTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val clock: Clock,
) {
    private val revealedAt = Instant.parse("2026-08-12T10:00:00Z")

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
    fun `advanceStage moves the stage exactly when the expected stage still holds`() {
        val round = aRound("rp-stage-advance")
        val roundGameId = requireNotNull(round.id)
        val userId = aUser()
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = revealedAt)

        plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 1
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)!!.stage shouldBe 1
        // same expected stage again: zero rows -- the idiom, not an error
        plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 0
    }

    @Test
    fun `advanceStage refuses once the play is spent`() {
        val round = aRound("rp-stage-spent")
        val roundGameId = requireNotNull(round.id)
        val userId = aUser()
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = revealedAt)

        plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 1
        plays.advanceStage(roundGameId = roundGameId, userId = userId, expectedStage = 0) shouldBe 0
    }

    @Test
    fun `giveUp spends the round without an answer, exactly once`() {
        val round = aRound("rp-give-up")
        val roundGameId = requireNotNull(round.id)
        val userId = aUser()
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = revealedAt)

        plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 1
        val row = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId)!!
        row.guessedAt.shouldNotBeNull()
        row.guess.shouldBeNull()
        row.qualifies.shouldBeNull()
        plays.giveUp(roundGameId = roundGameId, userId = userId, guessedAt = clock.instant()) shouldBe 0
    }
}
