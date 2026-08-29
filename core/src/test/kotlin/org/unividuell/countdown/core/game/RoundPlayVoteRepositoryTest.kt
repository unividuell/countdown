package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayVoteRepositoryTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val votes: RoundPlayVoteRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val at = Instant.parse("2026-08-29T10:00:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition,
            roundNumber = 12,
            gameType = "spot-object",
            params = json("""{"term":"Rosa Gartenzwerg","timed":false}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = at,
        )
    }

    /** A revealed, guessed play — the only kind anybody can vote on. */
    private fun aPlay(round: RoundGame, userId: UUID): UUID {
        val roundGameId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = at)
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId),
        )
        val id = requireNotNull(play.id)
        plays.recordGuess(
            id = id,
            guess = json("""{"panoId":"abc","heading":10.0,"pitch":0.0,"zoom":1.0}"""),
            guessedAt = at,
            qualifies = true,
            deviation = 0.0,
            outcome = json("""{"country":"ES"}"""),
        )
        return id
    }

    @Test
    fun `a second vote by the same voter replaces the first`() {
        val round = aRound("votes-replace")
        val target = aPlay(round = round, userId = aUser())
        val voter = aUser()

        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.FLAG, createdAt = at)
        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.CONFIRM, createdAt = at)

        val stored = votes.votesOfRound(requireNotNull(round.id))
        stored shouldHaveSize 1
        stored.single().value shouldBe Vote.CONFIRM
    }

    @Test
    fun `withdrawing removes the row entirely`() {
        val round = aRound("votes-withdraw")
        val target = aPlay(round = round, userId = aUser())
        val voter = aUser()

        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.FLAG, createdAt = at)
        votes.withdrawVote(roundPlayId = target, voterUserId = voter) shouldBe 1

        votes.votesOfRound(requireNotNull(round.id)) shouldHaveSize 0
    }

    @Test
    fun `the round-wide read returns every vote of every play, and nothing from another round`() {
        val round = aRound("votes-round")
        val other = aRound("votes-other-round")
        val firstTarget = aPlay(round = round, userId = aUser())
        val secondTarget = aPlay(round = round, userId = aUser())
        val elsewhere = aPlay(round = other, userId = aUser())

        votes.castVote(roundPlayId = firstTarget, voterUserId = aUser(), value = Vote.FLAG, createdAt = at)
        votes.castVote(roundPlayId = secondTarget, voterUserId = aUser(), value = Vote.CONFIRM, createdAt = at)
        votes.castVote(roundPlayId = elsewhere, voterUserId = aUser(), value = Vote.FLAG, createdAt = at)

        votes.votesOfRound(requireNotNull(round.id)) shouldHaveSize 2
    }

    @Test
    fun `the admin override starts null and survives a round trip in both directions`() {
        val round = aRound("override")
        val target = aPlay(round = round, userId = aUser())

        plays.findById(target).get().adminOverride.shouldBeNull()

        plays.updateAdminOverride(id = target, adminOverride = false) shouldBe 1
        plays.findById(target).get().adminOverride shouldBe false

        plays.updateAdminOverride(id = target, adminOverride = null) shouldBe 1
        plays.findById(target).get().adminOverride.shouldBeNull()
    }
}
