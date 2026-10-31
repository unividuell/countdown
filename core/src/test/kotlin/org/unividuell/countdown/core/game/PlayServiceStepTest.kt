package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
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
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.StageMovedOnException
import org.unividuell.countdown.core.game.internal.StepDto
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.NullNode
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * A step that carries data: the input is stored with the stage, the answer is recomputed for every
 * response, and stages that only count steps leave the guess to be scored like a single-stage game's.
 * [StepGame] is the smallest game of that shape — four stages, a step answers with the `n` it was
 * sent.
 */
@Import(TestcontainersConfiguration::class, PlayServiceStepTest.StepGame::class)
@SpringBootTest
@Transactional
class PlayServiceStepTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class StepGame {
        data class StepParams(val answer: String)
        data class StepPayload(val stages: Int) : GamePayload
        data class CountAnswer(val n: Int) : GameStepAnswer

        /** Four stages that do not score; a step answers with its `n`, a wrong guess is 2.5 off. */
        @Bean
        fun stepGame(): GameType<StepParams> = object : GameType<StepParams> {
            override val id = "step-fake"
            override val displayName = "Schrittig"
            override val paramsType = StepParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = StepParams(answer = "42")
            override fun present(params: StepParams) = StepPayload(stages = 4)
            override fun judge(params: StepParams, guess: JsonNode): Judgement {
                val right = guess.get("answer")?.asString() == params.answer
                // 2.5, not 0.0: a stored 2.5 can only have come from here, never from a stage.
                return Judgement(qualifies = right, deviation = if (right) 0.0 else 2.5, outcome = null)
            }
            override fun requiresReveal(params: StepParams) = false
            override fun scoresOnDuration(params: StepParams) = false
            override fun stages(params: StepParams) = 4
            override fun stagesScore(params: StepParams) = false
            override fun step(params: StepParams, stage: Int, input: JsonNode?): GameStepAnswer {
                val n = input?.get("n")?.takeIf { it.isInt } ?: throw InvalidStepException("a step needs an integer n")
                return CountAnswer(n = n.intValue())
            }
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

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

    /** A second ACTIVE member, added directly through the repository — a fixture. */
    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId, status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    /** Announces the current round as "step-fake" with answer "42", phase one. */
    private fun announceStep(community: Community): RoundGame {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        return store.announce(
            edition = edition, roundNumber = roundNumber,
            gameType = "step-fake", params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
    }

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun step(community: Community, userId: UUID, round: RoundGame, fromStage: Int, input: JsonNode?) =
        play.skip(
            slug = community.slug, userId = userId, isSuperAdmin = false,
            roundNumber = round.roundNumber, fromStage = fromStage, input = input,
        )

    private fun reveal(community: Community, userId: UUID, round: RoundGame) =
        play.reveal(slug = community.slug, userId = userId, isSuperAdmin = false, roundNumber = round.roundNumber)

    private fun guess(community: Community, userId: UUID, round: RoundGame, answer: String) =
        play.guess(
            slug = community.slug, userId = userId, isSuperAdmin = false,
            roundNumber = round.roundNumber, guess = json("""{"answer":"$answer"}"""),
        )

    private fun rowOf(round: RoundGame, userId: UUID) =
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = userId).shouldNotBeNull()

    @Test
    fun `a step stores its input and answers with the recomputed answer`() {
        val (community, viewer) = aCommunity("Step Answer")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)

        val res = step(community = community, userId = viewer, round = round, fromStage = 0, input = json("""{"n":7}"""))

        val expected = listOf(StepDto(input = json("""{"n":7}"""), answer = StepGame.CountAnswer(n = 7)))
        res.me.shouldNotBeNull().steps shouldBe expected
        reveal(community = community, userId = viewer, round = round).me.shouldNotBeNull().steps shouldBe expected
    }

    @Test
    fun `a stored step the game no longer reads is answered with null`() {
        val (community, viewer) = aCommunity("Step Unreadable")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)
        // Past `step`'s check, as a play from before the column was backfilled with nulls.
        plays.advanceStage(
            roundGameId = requireNotNull(round.id), userId = viewer, expectedStage = 0, input = NullNode.instance,
        )

        val res = reveal(community = community, userId = viewer, round = round)

        res.me.shouldNotBeNull().steps shouldBe listOf(StepDto(input = null, answer = null))
    }

    @Test
    fun `an invalid step input is refused and writes nothing`() {
        val (community, viewer) = aCommunity("Step Invalid")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)

        shouldThrow<InvalidStepException> {
            step(community = community, userId = viewer, round = round, fromStage = 0, input = json("{}"))
        }

        val row = rowOf(round = round, userId = viewer)
        row.stage shouldBe 0
        row.steps shouldBe json("[]")
    }

    @Test
    fun `no step beyond the last stage and none after the guess`() {
        val (community, viewer) = aCommunity("Step Bounds")
        val other = aMember(community = community, login = "other")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)
        repeat(3) { i ->
            step(community = community, userId = viewer, round = round, fromStage = i, input = json("""{"n":$i}"""))
        }

        shouldThrow<StageMovedOnException> {
            step(community = community, userId = viewer, round = round, fromStage = 3, input = json("""{"n":3}"""))
        }

        // Below the top and on the right stage: only the guard on the guess refuses it.
        reveal(community = community, userId = other, round = round)
        guess(community = community, userId = other, round = round, answer = "7")
        shouldThrow<StageMovedOnException> {
            step(community = community, userId = other, round = round, fromStage = 0, input = json("""{"n":1}"""))
        }
        rowOf(round = round, userId = other).steps shouldBe json("[]")
    }

    @Test
    fun `a wrong guess in phase one is recorded when stages do not score`() {
        val (community, viewer) = aCommunity("Step Wrong Guess")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)
        step(community = community, userId = viewer, round = round, fromStage = 0, input = json("""{"n":1}"""))

        val res = guess(community = community, userId = viewer, round = round, answer = "7")

        res.me.shouldNotBeNull().guessedAt.shouldNotBeNull()
        res.me.shouldNotBeNull().stage shouldBe 1
        rowOf(round = round, userId = viewer).deviation shouldBe 2.5
    }

    @Test
    fun `others see the inputs only`() {
        val (community, viewer) = aCommunity("Step Others")
        val other = aMember(community = community, login = "other")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)
        step(community = community, userId = viewer, round = round, fromStage = 0, input = json("""{"n":7}"""))
        guess(community = community, userId = viewer, round = round, answer = "42")
        reveal(community = community, userId = other, round = round)

        val res = guess(community = community, userId = other, round = round, answer = "42")

        res.others.single().steps shouldBe listOf(json("""{"n":7}"""))
    }

    @Test
    fun `two steps from the same stage count once`() {
        val (community, viewer) = aCommunity("Step Twice")
        val round = announceStep(community)
        reveal(community = community, userId = viewer, round = round)

        step(community = community, userId = viewer, round = round, fromStage = 0, input = json("""{"n":1}"""))
        shouldThrow<StageMovedOnException> {
            step(community = community, userId = viewer, round = round, fromStage = 0, input = json("""{"n":2}"""))
        }

        val row = rowOf(round = round, userId = viewer)
        row.stage shouldBe 1
        row.steps shouldBe json("""[{"n":1}]""")
    }
}
