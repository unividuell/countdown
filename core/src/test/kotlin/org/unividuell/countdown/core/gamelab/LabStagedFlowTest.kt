package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.NullNode
import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameStepAnswer
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidStepException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException
import org.unividuell.countdown.core.gamelab.internal.LabRound
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.LabStageMovedOnException
import org.unividuell.countdown.core.gamelab.internal.LabStepDto
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import java.util.UUID

/**
 * `song-snippet`'s staged flow, replayed by the lab: `guessActionFor` decides whether a wrong guess
 * below the top stage advances (no entry recorded, the new stage rides the response) or records
 * terminally — the same pure function `PlayService.guess` applies to a real round. The asset rule
 * is the real round's too: a clip's key opens once its stage is at or below the tester's own, the
 * solution only once the tester has spent their one guess — guessing or giving up either count.
 *
 * [SongSnippetTestCatalogConfiguration] keeps `song-snippet` off the network and off the empty pool
 * the test classpath's Deezer properties would otherwise leave it with — the same stub `LabServiceTest`
 * uses for the consolidation property.
 *
 * A step that carries data is replayed against [StepGame], the smallest game of that shape — the
 * lab's twin of `PlayServiceStepTest`.
 */
@Import(
    TestcontainersConfiguration::class, SongSnippetTestCatalogConfiguration::class,
    LabStagedFlowTest.StepGame::class,
)
@SpringBootTest
class LabStagedFlowTest(
    @Autowired val service: LabService,
    @Autowired val store: LabRoundStore,
) {

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val communityId = UUID.randomUUID()
    private val slug = "team"
    private val tester = UUID.randomUUID()
    private val mapper = JsonMapper.builder().build()

    /** The one member every test here needs — nobody else plays this round. */
    private fun aCommunityWithOneMember() {
        val community = Community(id = communityId, name = "Team", slug = slug, createdBy = UUID.randomUUID())
        every { communities.findBySlug(slug) } returns community
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()
    }

    @Test
    fun `the lab replays the staged flow - wrong below the top advances, stage rides the response`() {
        aCommunityWithOneMember()

        val opened = service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        opened.myStage shouldBe 0

        val afterWrong = service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        )

        afterWrong.myStage shouldBe 1
        // ADVANCE_STAGE only burns the stage — no entry is recorded for a wrong guess below the top.
        afterWrong.me.shouldBeNull()
    }

    @Test
    fun `lab assets follow the same rule - keys up to my stage, solution behind the spent guess`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        ).assetKeys.keys shouldBe setOf("clip-0")

        service.asset(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, name = "clip-3",
        ).header.mediaType shouldBe "audio/wav"

        shouldThrow<LabAssetForbiddenException> {
            service.asset(
                slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
                userId = tester, isSuperAdmin = false, name = "solution",
            )
        }

        service.giveUp(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        service.asset(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, name = "solution",
        ).header.mediaType shouldBe "audio/mpeg"
    }

    @Test
    fun `forgetting my guess resets my stage back to zero`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        ).myStage shouldBe 1

        val afterForget = service.forgetMine(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        // Otherwise a tester who deletes their guess would stand back in front of the gate at the
        // stage they had already burned through, unlocking assets a fresh replay has not earned yet.
        afterForget.myStage shouldBe 0
    }

    @Test
    fun `resetting the round puts every stage back to zero too`() {
        aCommunityWithOneMember()
        service.open(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        service.guess(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
            guess = mapper.readTree("""{"artist":"x","title":"y"}"""),
        ).myStage shouldBe 1

        val afterReset = service.resetRound(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )

        afterReset.myStage shouldBe 0
    }

    /** Two members with names, for the tests that read an entry back: a nameless one drops out of a response. */
    private fun aCommunityOfTwo(): UUID {
        val other = UUID.randomUUID()
        val community = Community(id = communityId, name = "Team", slug = slug, createdBy = UUID.randomUUID())
        every { communities.findBySlug(slug) } returns community
        every { memberships.isActiveMember(communityId = communityId, userId = any()) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } answers {
            secondArg<Collection<UUID>>().associateWith {
                MemberIdentity(username = "tester", avatar = Avatar(shortName = "T", bgColorHex = "#336699"))
            }
        }
        return other
    }

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun step(fromStage: Int, input: JsonNode?, game: String = "step-fake", user: UUID = tester) =
        service.skip(
            slug = slug, gameId = game, seed = 7, phase = Phase.ONE,
            userId = user, isSuperAdmin = false, fromStage = fromStage, input = input,
        )

    private fun stepGuess(answer: String, user: UUID = tester) =
        service.guess(
            slug = slug, gameId = "step-fake", seed = 7, phase = Phase.ONE,
            userId = user, isSuperAdmin = false, guess = json("""{"answer":"$answer"}"""),
        )

    private fun openStepGame(user: UUID = tester) =
        service.open(
            slug = slug, gameId = "step-fake", seed = 7, phase = Phase.ONE, userId = user, isSuperAdmin = false,
        )

    @Test
    fun `the lab stores a step's input and answers it`() {
        aCommunityOfTwo()

        val res = step(fromStage = 0, input = json("""{"n":7}"""))

        val expected = listOf(LabStepDto(input = json("""{"n":7}"""), answer = StepGame.CountAnswer(n = 7)))
        res.myStage shouldBe 1
        res.mySteps shouldBe expected
        // Recomputed on a reload, not remembered: the same answer comes back.
        openStepGame().mySteps shouldBe expected
    }

    @Test
    fun `a stored lab step the game no longer reads is answered with null`() {
        aCommunityOfTwo()
        openStepGame()
        // Straight into the store, past `step`'s check.
        store.advanceStage(
            communityId = communityId, gameId = "step-fake", round = aRound(), userId = tester,
            expected = 0, input = null,
        )

        openStepGame().mySteps shouldBe listOf(LabStepDto(input = null, answer = null))
    }

    @Test
    fun `an invalid lab step is refused and counts nothing`() {
        aCommunityOfTwo()

        shouldThrow<InvalidStepException> { step(fromStage = 0, input = json("{}")) }

        val after = openStepGame()
        after.myStage shouldBe 0
        after.mySteps.shouldBeEmpty()
    }

    @Test
    fun `a lab step without input stores null`() {
        aCommunityOfTwo()

        // JSON null and no input at all are the same thing: no input.
        step(fromStage = 0, input = null, game = "song-snippet")
        val res = step(fromStage = 1, input = NullNode.instance, game = "song-snippet")

        res.mySteps shouldBe listOf(LabStepDto(input = null, answer = null), LabStepDto(input = null, answer = null))
        val spent = service.giveUp(
            slug = slug, gameId = "song-snippet", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false,
        )
        spent.me.shouldNotBeNull().steps shouldBe listOf(NullNode.instance, NullNode.instance)
    }

    @Test
    fun `no lab step after my guess`() {
        aCommunityOfTwo()
        stepGuess(answer = "42")

        // Still stage 0, so only the entry refuses it.
        shouldThrow<LabStageMovedOnException> { step(fromStage = 0, input = json("""{"n":1}""")) }

        val after = openStepGame()
        after.myStage shouldBe 0
        after.mySteps.shouldBeEmpty()
    }

    @Test
    fun `no lab step off the top and none twice from the same stage`() {
        aCommunityOfTwo()

        // Four stages: the last step goes from 2 to 3, a step from 3 has nowhere to go.
        shouldThrow<LabStageMovedOnException> { step(fromStage = 3, input = json("""{"n":1}""")) }
        shouldThrow<LabStageMovedOnException> { step(fromStage = -1, input = json("""{"n":1}""")) }
        step(fromStage = 0, input = json("""{"n":1}"""))
        shouldThrow<LabStageMovedOnException> { step(fromStage = 0, input = json("""{"n":2}""")) }

        openStepGame().mySteps.map { it.input } shouldBe listOf(json("""{"n":1}"""))
    }

    @Test
    fun `forgetting my guess and resetting the round clear my steps`() {
        aCommunityOfTwo()
        step(fromStage = 0, input = json("""{"n":7}"""))
        stepGuess(answer = "42")

        val afterForget = service.forgetMine(
            slug = slug, gameId = "step-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        )

        afterForget.myStage shouldBe 0
        afterForget.mySteps.shouldBeEmpty()

        step(fromStage = 0, input = json("""{"n":8}"""))
        val afterReset = service.resetRound(
            slug = slug, gameId = "step-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        )

        afterReset.myStage shouldBe 0
        afterReset.mySteps.shouldBeEmpty()
    }

    @Test
    fun `the lab records a wrong guess when stages do not score`() {
        aCommunityOfTwo()
        step(fromStage = 0, input = json("""{"n":1}"""))

        val res = stepGuess(answer = "7")

        // Phase one, wrong, below the top: a scoring ladder would burn a stage instead of recording.
        res.me.shouldNotBeNull().stage shouldBe 1
        // 2.5 is the game's own distance; the stage (1) would show up here if the ladder scored.
        store.open(communityId = communityId, gameId = "step-fake", round = aRound())
            .entries.single().deviation shouldBe 2.5
        res.mySteps.map { it.input } shouldBe listOf(json("""{"n":1}"""))
    }

    @Test
    fun `others' entries carry their inputs`() {
        val other = aCommunityOfTwo()
        step(fromStage = 0, input = json("""{"n":7}"""))
        stepGuess(answer = "42")

        val res = stepGuess(answer = "42", user = other)

        res.others.single().steps shouldBe listOf(json("""{"n":7}"""))
        res.me.shouldNotBeNull().steps.shouldBeEmpty()
        // The answers stay with their owner: only the inputs ride on somebody else's entry.
        res.mySteps.shouldBeEmpty()
    }

    /** Only the key matters: the store hands back the round it froze first. */
    private fun aRound() = LabRound(
        seed = 7, phase = Phase.ONE, params = json("{}"), award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
    )

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
}
