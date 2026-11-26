package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.StackFloorGameType
import org.unividuell.countdown.core.game.internal.StackFloorMark
import org.unividuell.countdown.core.game.internal.StackFloorOutcome
import org.unividuell.countdown.core.game.internal.StackFloorParams
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class StackFloorGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val mapper = JsonMapper.builder().build()
    private val game = StackFloorGameType(mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun draw(random: GameRandom = random(), phase: Phase = Phase.ONE, difficulty: Double = 0.0) = game.draw(
        random = random,
        context = RoundContext(communityId = community, roundNumber = 12, phase = phase, difficulty = difficulty),
    )

    private fun tree(value: Any?): JsonNode = mapper.readTree(mapper.writeValueAsString(value))

    private fun guess(json: String) = mapper.readTree(json)

    /** Start left, start right, start left: two floors, then a miss. */
    private val twoFloors = """{"clicks":[0,0,0]}"""

    private fun params(target: Int?, maxFloors: Int = StackFloorGameType.MAX_FLOORS) = StackFloorParams(
        fieldWidth = StackFloorGameType.FIELD_WIDTH,
        startWidth = StackFloorGameType.START_WIDTH,
        speedNum = StackFloorGameType.SPEED_NUM,
        speedDen = StackFloorGameType.SPEED_DEN,
        pauseMs = StackFloorGameType.PAUSE_MS,
        maxFloors = maxFloors,
        hueStart = 0,
        target = target,
    )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "stack-floor"
        game.displayName shouldBe "Hochstapler"
    }

    @Test
    fun `the target follows the difficulty, only in phase one`() {
        StackFloorGameType.targetBase(0.0) shouldBe 11
        StackFloorGameType.targetBase(0.5) shouldBe 28
        StackFloorGameType.targetBase(1.0) shouldBe 45

        listOf(0.0, 0.5, 1.0).forEach { difficulty ->
            val base = StackFloorGameType.targetBase(difficulty)
            val low = maxOf(11, base - 2)
            val high = minOf(45, base + 2)

            (0 until 200).forEach { seed ->
                (draw(random = random(presentation = seed), difficulty = difficulty).target!! in low..high) shouldBe true
            }
            draw(phase = Phase.TWO, difficulty = difficulty).target.shouldBeNull()
        }
    }

    @Test
    fun `the hue comes from the scene stream, the target from the presentation stream`() {
        draw(random = random(scene = 7, presentation = 1)).hueStart shouldBe
            draw(random = random(scene = 7, presentation = 99, solution = 5)).hueStart
        draw(random = random(presentation = 7, scene = 1), difficulty = 0.5).target shouldBe
            draw(random = random(presentation = 7, scene = 99, solution = 5), difficulty = 0.5).target

        (0 until 20).map { draw(random = random(scene = it)).hueStart }.toSet().size shouldNotBe 1
    }

    @Test
    fun `both phases need the one reveal and score no duration`() {
        listOf(Phase.ONE, Phase.TWO).forEach { phase ->
            val params = draw(phase = phase)

            game.requiresReveal(params) shouldBe true
            game.scoresOnDuration(params) shouldBe false
            game.stages(params) shouldBe 1
        }
    }

    @Test
    fun `every exit carries exactly its fields`() {
        val params = draw()
        val scene = tree(game.scene(params))
        val payload = tree(game.present(params))
        val outcome = tree(game.judge(params = params(target = 2), guess = guess(twoFloors)).outcome)

        scene.propertyNames().toSet() shouldBe setOf("fieldWidth", "startWidth", "hueStart")
        payload.propertyNames().toSet() shouldBe setOf(
            "fieldWidth", "startWidth", "speedNum", "speedDen", "pauseMs", "maxFloors", "hueStart", "target",
        )
        outcome.propertyNames().toSet() shouldBe setOf("height", "marks")
        game.solution(params).shouldBeNull()
    }

    @Test
    fun `phase one qualifies from the target on`() {
        game.judge(params = params(target = 2), guess = guess(twoFloors)).let {
            it.qualifies shouldBe true
            it.deviation shouldBe 0.0
            (it.outcome as StackFloorOutcome).height shouldBe 2
        }
        game.judge(params = params(target = 3), guess = guess(twoFloors)).let {
            it.qualifies shouldBe false
            it.deviation shouldBe 0.0
        }
    }

    @Test
    fun `phase two always qualifies, higher is smaller`() {
        game.judge(params = params(target = null), guess = guess(twoFloors)).let {
            it.qualifies shouldBe true
            it.deviation shouldBe -2.0
        }
    }

    @Test
    fun `the stored guess is the checked clicks and the restart flag`() {
        val stored = game.judge(
            params = params(target = null),
            guess = guess("""{"clicks":[0,0,0],"note":"x"}"""),
        ).guess.shouldNotBeNull()

        stored shouldBe guess("""{"clicks":[0,0,0],"restarted":false}""")
    }

    @Test
    fun `a restart is marked, not refused`() {
        val judged = game.judge(
            params = params(target = null),
            guess = guess("""{"clicks":[0,0,0],"restarted":true}"""),
        )

        (judged.outcome as StackFloorOutcome).let {
            it.marks shouldBe listOf(StackFloorMark.RESTARTED)
            it.height shouldBe 2
        }
    }

    @Test
    fun `a guess faster than its run is marked, not refused`() {
        fun marksAt(sinceRevealMs: Long?) = (
            game.judge(
                params = params(target = null),
                guess = guess(twoFloors),
                context = GuessContext(sinceRevealMs = sinceRevealMs, playId = null),
            ).outcome as StackFloorOutcome
            ).marks

        marksAt(599) shouldContain StackFloorMark.SUBMITTED_BEFORE_RUN_END
        marksAt(600) shouldNotContain StackFloorMark.SUBMITTED_BEFORE_RUN_END
        marksAt(null) shouldNotContain StackFloorMark.SUBMITTED_BEFORE_RUN_END
    }

    @Test
    fun `both marks come together, in declaration order`() {
        val judged = game.judge(
            params = params(target = null),
            guess = guess("""{"clicks":[0,0,0],"restarted":true}"""),
            context = GuessContext(sinceRevealMs = 599, playId = null),
        )

        (judged.outcome as StackFloorOutcome).marks shouldBe
            listOf(StackFloorMark.RESTARTED, StackFloorMark.SUBMITTED_BEFORE_RUN_END)
    }

    @Test
    fun `a single-click run has no pause in its earliest end`() {
        fun marksAt(sinceRevealMs: Long) = (
            game.judge(
                params = params(target = null, maxFloors = 1),
                guess = guess("""{"clicks":[100]}"""),
                context = GuessContext(sinceRevealMs = sinceRevealMs, playId = null),
            ).outcome as StackFloorOutcome
            ).marks

        marksAt(99) shouldContain StackFloorMark.SUBMITTED_BEFORE_RUN_END
        marksAt(100) shouldNotContain StackFloorMark.SUBMITTED_BEFORE_RUN_END
    }

    @Test
    fun `a malformed guess is refused before anything is written`() {
        listOf(
            """{}""",
            """{"clicks":[]}""",
            """{"clicks":"0"}""",
            """{"clicks":[-1]}""",
            """{"clicks":[1.5]}""",
            """{"clicks":["1"]}""",
            """{"clicks":[3600001]}""",
            """{"clicks":[9999999999]}""",
            """{"clicks":[null]}""",
            """{"clicks":[0,0,0],"restarted":"yes"}""",
            // Clicks after the miss.
            """{"clicks":[0,0,0,0]}""",
            // A run without a miss, under maxFloors.
            """{"clicks":[0,0]}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params(target = null), guess = guess(json)) }
        }
    }

    @Test
    fun `a run that reaches maxFloors needs no miss`() {
        val judged = game.judge(params = params(target = null, maxFloors = 2), guess = guess("""{"clicks":[0,0]}"""))

        (judged.outcome as StackFloorOutcome).height shouldBe 2

        shouldThrow<InvalidGuessException> {
            game.judge(params = params(target = null, maxFloors = 2), guess = guess("""{"clicks":[0,0,0]}"""))
        }
    }
}
