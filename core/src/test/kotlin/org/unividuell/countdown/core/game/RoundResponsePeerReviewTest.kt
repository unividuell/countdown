package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundPlayVoteRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * Same fixture shape as [ReviewServiceTest]: a test-only game type that allows peer review, plays
 * written straight through [RoundPlayRepository] and votes straight through [RoundPlayVoteRepository]
 * — nothing here needs [org.unividuell.countdown.core.game.internal.ReviewService] to exist.
 */
@Import(TestcontainersConfiguration::class, RoundResponsePeerReviewTest.ReviewableGame::class)
@SpringBootTest
@Transactional
class RoundResponsePeerReviewTest(
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val votes: RoundPlayVoteRepository,
    @Autowired val store: RoundGameStore,
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
        val ownerId = aUser("owner-${System.nanoTime()}")
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
    private fun guessed(roundGameId: UUID, userId: UUID) {
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = clock.instant())
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId))
        plays.recordGuess(
            id = requireNotNull(play.id), guess = mapper.readTree("""{"answer":"42"}"""),
            guessedAt = clock.instant(), qualifies = true, deviation = 0.0, outcome = null,
        )
    }

    @Test
    fun `a tip carries every vote by name, in both directions`() {
        val (community, target) = aCommunity("Named Votes")
        val flagger1 = aMember(community, "flagger1")
        val flagger2 = aMember(community, "flagger2")
        val confirmer = aMember(community, "confirmer")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)
        guessed(roundGameId, flagger1)
        guessed(roundGameId, flagger2)
        guessed(roundGameId, confirmer)
        val targetPlayId = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = target)?.id,
        )
        votes.castVote(roundPlayId = targetPlayId, voterUserId = flagger1, value = Vote.FLAG, createdAt = clock.instant())
        votes.castVote(roundPlayId = targetPlayId, voterUserId = flagger2, value = Vote.FLAG, createdAt = clock.instant())
        votes.castVote(roundPlayId = targetPlayId, voterUserId = confirmer, value = Vote.CONFIRM, createdAt = clock.instant())

        val res = announcements.currentRound(slug = community.slug, userId = flagger1, isSuperAdmin = false)

        val row = requireNotNull(res.others.find { it.userId == target })
        row.votes shouldHaveSize 3
        row.votes.map { it.username to it.value }.toSet() shouldBe setOf(
            "flagger1" to Vote.FLAG, "flagger2" to Vote.FLAG, "confirmer" to Vote.CONFIRM,
        )
        row.struck shouldBe true
        row.adminOverride.shouldBeNull()
    }

    @Test
    fun `the viewer's own tip carries its votes too`() {
        val (community, owner) = aCommunity("Own Votes")
        val voter = aMember(community, "voter")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, owner)
        guessed(roundGameId, voter)
        val ownerPlayId = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = owner)?.id,
        )
        votes.castVote(roundPlayId = ownerPlayId, voterUserId = voter, value = Vote.CONFIRM, createdAt = clock.instant())

        val res = announcements.currentRound(slug = community.slug, userId = owner, isSuperAdmin = false)

        val mine = requireNotNull(res.me)
        mine.votes shouldHaveSize 1
        mine.votes.single().let {
            it.username shouldBe "voter"
            it.value shouldBe Vote.CONFIRM
        }
        mine.struck shouldBe false
    }

    @Test
    fun `a tip nobody voted on is not struck and carries an empty list`() {
        val (community, target) = aCommunity("No Votes")
        val voter = aMember(community, "voter")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)
        guessed(roundGameId, voter)

        val res = announcements.currentRound(slug = community.slug, userId = voter, isSuperAdmin = false)

        val row = requireNotNull(res.others.find { it.userId == target })
        row.votes.shouldBeEmpty()
        row.struck shouldBe false
    }

    @Test
    fun `struck follows the override, not only the count`() {
        val (community, target) = aCommunity("Override Wins")
        val flagger1 = aMember(community, "flagger1")
        val flagger2 = aMember(community, "flagger2")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)
        guessed(roundGameId, flagger1)
        guessed(roundGameId, flagger2)
        val targetPlay = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = target),
        )
        votes.castVote(roundPlayId = targetPlay.id!!, voterUserId = flagger1, value = Vote.FLAG, createdAt = clock.instant())
        votes.castVote(roundPlayId = targetPlay.id!!, voterUserId = flagger2, value = Vote.FLAG, createdAt = clock.instant())
        plays.updateAdminOverride(id = targetPlay.id!!, adminOverride = true)

        val res = announcements.currentRound(slug = community.slug, userId = flagger1, isSuperAdmin = false)

        val row = requireNotNull(res.others.find { it.userId == target })
        row.struck shouldBe false
        row.adminOverride shouldBe true
    }

    @Test
    fun `canOverride is true for the community admin and false for a plain member`() {
        val (community, admin) = aCommunity("Override Permission")
        val member = aMember(community, "member")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, admin)
        guessed(roundGameId, member)

        val asAdmin = announcements.currentRound(slug = community.slug, userId = admin, isSuperAdmin = false)
        val asMember = announcements.currentRound(slug = community.slug, userId = member, isSuperAdmin = false)

        asAdmin.canOverride shouldBe true
        asMember.canOverride shouldBe false
    }

    @Test
    fun `votes stay hidden while the viewer has not guessed`() {
        val (community, target) = aCommunity("Not Guessed Yet")
        val viewer = aMember(community, "viewer")
        val roundNumber = currentRoundNumberOf(community)
        announceReview(community, roundNumber)
        val roundGameId = roundGameIdOf(community, roundNumber)
        guessed(roundGameId, target)

        val res = announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false)

        res.others.shouldBeEmpty()
    }
}
