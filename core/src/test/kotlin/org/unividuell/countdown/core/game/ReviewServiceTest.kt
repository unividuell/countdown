package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.ReviewNotAllowedException
import org.unividuell.countdown.core.game.internal.ReviewNotOpenException
import org.unividuell.countdown.core.game.internal.ReviewService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundPlayVoteRepository
import org.unividuell.countdown.core.game.internal.RoundScoring
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * Every test here plays a game type built just for this file: one that allows peer review, unlike
 * every real game in the catalogue today. Plays are written straight through [RoundPlayRepository],
 * the same fixture shape [RoundScoringPeerReviewTest] uses — a play row does not need
 * [org.unividuell.countdown.core.game.internal.PlayService] to exist, and that service can only ever
 * touch the running round anyway, never the one before it.
 */
@Import(TestcontainersConfiguration::class, ReviewServiceTest.ReviewableGame::class)
@SpringBootTest
@Transactional
class ReviewServiceTest(
    @Autowired val review: ReviewService,
    @Autowired val scoring: RoundScoring,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val votes: RoundPlayVoteRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val catalog: GameCatalog,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {

    /** A test-only game that allows peer review — no real game does yet. */
    @TestConfiguration
    class ReviewableGame {
        data class ReviewParams(val answer: String)
        data class ReviewPayload(val prompt: String) : GamePayload

        @Bean
        fun reviewableGame(): GameType<ReviewParams> = object : GameType<ReviewParams> {
            override val id = "review-fake"
            override val displayName = "Testurteil"
            override val paramsType = ReviewParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = ReviewParams(answer = "42")
            override fun present(params: ReviewParams) = ReviewPayload(prompt = "42?")
            override fun judge(params: ReviewParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: ReviewParams) = false
            override fun allowsPeerReview(params: ReviewParams) = true
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    /** A community whose countdown starts in 2099, with its creator as the first ACTIVE, admin member. */
    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId, status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** Announces [roundNumber] as this file's peer-review-enabled game, bypassing selection. */
    private fun announceReview(community: Community, roundNumber: Int) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "review-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
    }

    private fun roundGameIdOf(community: Community, roundNumber: Int): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(store.find(edition = edition, roundNumber = roundNumber)?.id)
    }

    /** Reveal and guess in one step, straight through the repository — no service needed here. */
    private fun guessed(roundGameId: UUID, userId: UUID, qualifies: Boolean = true) {
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = clock.instant())
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId))
        plays.recordGuess(
            id = requireNotNull(play.id), guess = mapper.readTree("""{"answer":"42"}"""),
            guessedAt = clock.instant(), qualifies = qualifies, deviation = 0.0, outcome = null,
        )
    }

    @Test
    fun `a player who guessed may flag somebody else's tip, and the points move`() {
        val (community, target) = aCommunity("Flag Round")
        val voter1 = aMember(community, "voter1")
        val voter2 = aMember(community, "voter2")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val round = requireNotNull(store.find(edition = edition, roundNumber = roundNumber))
        val roundGameId = requireNotNull(round.id)
        guessed(roundGameId, target)
        guessed(roundGameId, voter1)
        guessed(roundGameId, voter2)
        scoring.reevaluate(round)
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = target)?.points shouldBe 1

        val targetPlayId = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = target)?.id,
        )
        // One flag already stands, from a fixture voter — not enough to strike on its own.
        votes.castVote(roundPlayId = targetPlayId, voterUserId = voter1, value = Vote.FLAG, createdAt = clock.instant())

        review.vote(
            slug = community.slug, voterId = voter2, isSuperAdmin = false,
            roundNumber = roundNumber, targetUserId = target, value = Vote.FLAG,
        )

        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = target)?.points shouldBe 0
    }

    @Test
    fun `voting again replaces the vote, and a null value withdraws it`() {
        val (community, target) = aCommunity("Replace Vote")
        val voter = aMember(community, "voter")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)
        guessed(roundGameId, voter)

        review.vote(
            slug = community.slug, voterId = voter, isSuperAdmin = false,
            roundNumber = roundNumber, targetUserId = target, value = Vote.CONFIRM,
        )
        votes.votesOfRound(roundGameId).single().value shouldBe Vote.CONFIRM

        review.vote(
            slug = community.slug, voterId = voter, isSuperAdmin = false,
            roundNumber = roundNumber, targetUserId = target, value = Vote.FLAG,
        )
        votes.votesOfRound(roundGameId).single().value shouldBe Vote.FLAG

        review.vote(
            slug = community.slug, voterId = voter, isSuperAdmin = false,
            roundNumber = roundNumber, targetUserId = target, value = null,
        )
        votes.votesOfRound(roundGameId).shouldBeEmpty()
    }

    @Test
    fun `nobody may vote on their own tip`() {
        val (community, owner) = aCommunity("Self Vote")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)

        shouldThrow<ReviewNotAllowedException> {
            review.vote(
                slug = community.slug, voterId = owner, isSuperAdmin = false,
                roundNumber = roundNumber, targetUserId = owner, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `somebody who has not played the round may not vote`() {
        val (community, target) = aCommunity("Unplayed Voter")
        val voter = aMember(community, "voter")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)

        shouldThrow<ReviewNotAllowedException> {
            review.vote(
                slug = community.slug, voterId = voter, isSuperAdmin = false,
                roundNumber = roundNumber, targetUserId = target, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `the current round and the one before it accept votes`() {
        val (community, target) = aCommunity("Two Rounds")
        val voter = aMember(community, "voter")
        val currentNumber = currentRoundNumberOf(community)
        val previousNumber = currentNumber + 1
        announceReview(community, previousNumber)
        announceReview(community, currentNumber)
        val currentGameId = roundGameIdOf(community, currentNumber)
        val previousGameId = roundGameIdOf(community, previousNumber)
        guessed(currentGameId, target)
        guessed(currentGameId, voter)
        guessed(previousGameId, target)
        guessed(previousGameId, voter)

        review.vote(
            slug = community.slug, voterId = voter, isSuperAdmin = false,
            roundNumber = currentNumber, targetUserId = target, value = Vote.CONFIRM,
        )
        review.vote(
            slug = community.slug, voterId = voter, isSuperAdmin = false,
            roundNumber = previousNumber, targetUserId = target, value = Vote.CONFIRM,
        )

        votes.votesOfRound(currentGameId) shouldHaveSize 1
        votes.votesOfRound(previousGameId) shouldHaveSize 1
    }

    @Test
    fun `anything older than the previous round is not found`() {
        val (community, target) = aCommunity("Too Old")
        val voter = aMember(community, "voter")
        val currentNumber = currentRoundNumberOf(community)
        val previousNumber = currentNumber + 1
        announceReview(community, previousNumber)
        announceReview(community, currentNumber)

        shouldThrow<RoundNotFoundException> {
            review.vote(
                slug = community.slug, voterId = voter, isSuperAdmin = false,
                roundNumber = previousNumber + 1, targetUserId = target, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `a game that does not allow peer review refuses the vote`() {
        val (community, target) = aCommunity("No Review Game")
        val voter = aMember(community, "voter")
        val roundNumber = currentRoundNumberOf(community)
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
            params = requireNotNull(catalog.handle("guess-hue")).draw(
                random = GameRandom.independent(SecureRandom()),
                context = RoundContext(roundNumber = roundNumber, phase = Phase.ONE),
            ),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        shouldThrow<ReviewNotOpenException> {
            review.vote(
                slug = community.slug, voterId = voter, isSuperAdmin = false,
                roundNumber = roundNumber, targetUserId = target, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `only a community admin may set the override`() {
        val (community, owner) = aCommunity("Override Guard")
        val member = aMember(community, "member")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, owner)

        shouldThrow<ReviewNotAllowedException> {
            review.override(
                slug = community.slug, adminId = member, isSuperAdmin = false,
                roundNumber = roundNumber, targetUserId = owner, value = true,
            )
        }
    }
}
