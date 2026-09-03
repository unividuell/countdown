package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
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
import org.unividuell.countdown.core.game.internal.AlreadyGuessedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.StageMovedOnException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The staged guess flow: a wrong guess below the last stage advances instead of recording, skip is
 * the same advance on request, giving up is the explicit exit without an answer, and CLOSEST_ONLY
 * (phase two) stays terminal on the first guess regardless of stage. [StagedGame] is the smallest
 * possible staged game — five stages, string equality — so these run against the framework's own
 * rules rather than any real game's judging.
 */
@Import(TestcontainersConfiguration::class, PlayServiceStagedTest.StagedGame::class)
@SpringBootTest
@Transactional
class PlayServiceStagedTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class StagedGame {
        data class StagedParams(val answer: String)
        data class StagedPayload(val stages: Int) : GamePayload

        /** Five stages, judges string equality on "answer" — the smallest staged game possible. */
        @Bean
        fun stagedGame(): GameType<StagedParams> = object : GameType<StagedParams> {
            override val id = "staged-fake"
            override val displayName = "Stufig"
            override val paramsType = StagedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = StagedParams(answer = "42")
            override fun present(params: StagedParams) = StagedPayload(stages = 5)
            override fun judge(params: StagedParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: StagedParams) = false
            override fun stages(params: StagedParams) = 5
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

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

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** A second ACTIVE member, added directly through the repository — a fixture, not the thing
     *  under test (see PlayServiceTest.aMember). */
    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId, status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    /** Announces the current round as "staged-fake" with answer "42", under [award]. */
    private fun announceStaged(community: Community, award: Award): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        store.announce(
            edition = edition, roundNumber = roundNumber,
            gameType = "staged-fake", params = mapper.readTree("""{"answer":"42"}"""),
            award = award, announcedAt = clock.instant(),
        )
        return roundNumber
    }

    private fun wrongGuess(): JsonNode = mapper.readTree("""{"answer":"7"}""")
    private fun correctGuess(): JsonNode = mapper.readTree("""{"answer":"42"}""")

    @Test
    fun `a wrong guess below the last stage advances instead of recording`() {
        val (community, viewer) = aCommunity("Stage Advance")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = wrongGuess(),
        )

        res.me.shouldNotBeNull().stage shouldBe 1
        res.me.shouldNotBeNull().guessedAt.shouldBeNull()
        res.solution.shouldBeNull()
    }

    @Test
    fun `a correct guess records with the stage as its deviation`() {
        val (community, viewer) = aCommunity("Stage Correct")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = correctGuess(),
        )

        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
        res.me.shouldNotBeNull().stage shouldBe 1
        res.me.shouldNotBeNull().points shouldBe 1
    }

    @Test
    fun `a wrong guess on the last stage is terminal with zero points`() {
        val (community, viewer) = aCommunity("Stage Terminal")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        repeat(4) { i ->
            play.skip(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, fromStage = i,
            )
        }

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = wrongGuess(),
        )

        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
        res.me.shouldNotBeNull().points shouldBe 0
    }

    @Test
    fun `under CLOSEST_ONLY every guess is terminal`() {
        val (community, viewer) = aCommunity("Stage Closest Terminal")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.CLOSEST_ONLY, points = 5))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val res = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, guess = wrongGuess(),
        )

        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
    }

    @Test
    fun `skip is guarded by the expected stage`() {
        val (community, viewer) = aCommunity("Stage Skip Guard")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )

        shouldThrow<StageMovedOnException> {
            play.skip(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, fromStage = 0,
            )
        }
        shouldThrow<StageMovedOnException> {
            play.skip(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, fromStage = 4,
            )
        }
    }

    @Test
    fun `under CLOSEST_ONLY the least audio wins, and a tie pays both in full`() {
        val (community, alice) = aCommunity("Stage Closest Least Audio")
        val bob = aMember(community = community, login = "bob")
        val carol = aMember(community = community, login = "carol")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.CLOSEST_ONLY, points = 5))

        // alice: correct right away, at stage 0 — the least audio anyone will have heard.
        play.reveal(slug = community.slug, userId = alice, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = alice, isSuperAdmin = false,
            roundNumber = roundNumber, guess = correctGuess(),
        )

        // bob: skips once (to stage 1), then guesses correctly — more audio than alice needed.
        play.reveal(slug = community.slug, userId = bob, isSuperAdmin = false)
        play.skip(
            slug = community.slug, userId = bob, isSuperAdmin = false,
            roundNumber = roundNumber, fromStage = 0,
        )
        val afterBob = play.guess(
            slug = community.slug, userId = bob, isSuperAdmin = false,
            roundNumber = roundNumber, guess = correctGuess(),
        )

        afterBob.others.single { it.userId == alice }.points shouldBe 5
        afterBob.me.shouldNotBeNull().points shouldBe 0

        // carol ties alice at stage 0 — a tie pays both in full, it does not split.
        play.reveal(slug = community.slug, userId = carol, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = carol, isSuperAdmin = false,
            roundNumber = roundNumber, guess = correctGuess(),
        )

        val final = play.reveal(slug = community.slug, userId = alice, isSuperAdmin = false)
        final.me.shouldNotBeNull().points shouldBe 5
        final.others.single { it.userId == carol }.points shouldBe 5
    }

    @Test
    fun `giving up spends the round without an answer`() {
        val (community, viewer) = aCommunity("Stage Give Up")
        val roundNumber = announceStaged(community = community, award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val res = play.giveUp(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = roundNumber,
        )

        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
        res.me.shouldNotBeNull().points shouldBe 0
        // staged-fake has no solution() — the gate itself is Task 4's concern.
        res.solution.shouldBeNull()
        shouldThrow<AlreadyGuessedException> {
            play.giveUp(
                slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = roundNumber,
            )
        }
    }
}
