package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.nulls.shouldNotBeNull
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.TurnPipesGameType
import org.unividuell.countdown.core.game.internal.TurnPipesOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.turnpipes.PipeKind
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class TurnPipesGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val mapper = JsonMapper.builder().build()
    private val game = TurnPipesGameType(mapper = mapper)

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

    private fun guessOf(rotations: List<Int>): JsonNode = mapper.valueToTree(mapOf("rotations" to rotations))

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "turn-pipes"
        game.displayName shouldBe "Verrohrung"
    }

    @Test
    fun `the size follows the difficulty`() {
        listOf(0.0 to 6, 0.33 to 6, 0.34 to 7, 0.66 to 7, 0.67 to 8, 1.0 to 8).forEach { (difficulty, size) ->
            TurnPipesGameType.sizeFor(difficulty) shouldBe size
        }
        draw(difficulty = 0.9).size shouldBe 8
    }

    @Test
    fun `everything follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)) shouldBe draw(random = random(presentation = 2))
    }

    @Test
    fun `phase two is timed - one deliberate reveal, scored on the clock`() {
        val one = draw(phase = Phase.ONE)
        val two = draw(phase = Phase.TWO)

        one.timed shouldBe false
        game.requiresReveal(one) shouldBe false
        game.scoresOnDuration(one) shouldBe false
        two.timed shouldBe true
        game.requiresReveal(two) shouldBe true
        game.scoresOnDuration(two) shouldBe true
    }

    @Test
    fun `every exit carries exactly its fields`() {
        val params = draw()
        val scene = tree(game.scene(params))
        val payload = tree(game.present(params))
        val solution = tree(game.solution(params))
        val hit = tree(game.judge(params = params, guess = guessOf(params.solution)).outcome)
        val miss = tree(game.judge(params = params, guess = guessOf(params.start)).outcome)

        scene.propertyNames().toSet() shouldBe setOf("size")
        payload.propertyNames().toSet() shouldBe setOf("size", "kinds", "start")
        payload.get("kinds").get(0).isString shouldBe true
        solution.propertyNames().toSet() shouldBe setOf("rotations", "path")
        hit.propertyNames().toSet() shouldBe setOf("correct", "wet", "leak")
        miss.get("leak").propertyNames().toSet() shouldBe setOf("at", "from")
    }

    @Test
    fun `the solution is a hit, and so is a straight turned half way`() {
        val params = draw()
        val turned = params.solution.mapIndexed { cell, rotation ->
            if (params.kinds[cell] == PipeKind.STRAIGHT) (rotation + 2) % 4 else rotation
        }

        listOf(params.solution, turned).forEach { rotations ->
            game.judge(params = params, guess = guessOf(rotations)).let {
                it.qualifies shouldBe true
                it.deviation shouldBe 0.0
                (it.outcome as TurnPipesOutcome).correct shouldBe true
                it.outcome.wet.size shouldBe params.size * params.size
            }
        }
    }

    @Test
    fun `the start is a miss, and the outcome says where it stopped`() {
        val params = draw()

        game.judge(params = params, guess = guessOf(params.start)).let {
            it.qualifies shouldBe false
            (it.outcome as TurnPipesOutcome).correct shouldBe false
            it.outcome.leak.shouldNotBeNull()
        }
    }

    @Test
    fun `the stored guess is the validated rotations and nothing else`() {
        val params = draw()
        val body = params.solution.joinToString(",")
        val stored = game.judge(
            params = params,
            guess = guess("""{"rotations":[$body],"note":"hi"}"""),
        ).guess.shouldNotBeNull()

        stored.propertyNames().toSet() shouldBe setOf("rotations")
    }

    @Test
    fun `a malformed guess is refused before anything is written`() {
        val params = draw()
        val cells = params.size * params.size

        fun rotationsWith(value: String) = (List(cells - 1) { "0" } + value).joinToString(",")

        listOf(
            """{}""",
            """{"rotations":"0"}""",
            """{"rotations":[${List(cells - 1) { 0 }.joinToString(",")}]}""",
            """{"rotations":[${List(cells + 1) { 0 }.joinToString(",")}]}""",
            """{"rotations":[${rotationsWith("-1")}]}""",
            """{"rotations":[${rotationsWith("4")}]}""",
            """{"rotations":[${rotationsWith("1.5")}]}""",
            """{"rotations":[${rotationsWith("\"1\"")}]}""",
            """{"rotations":[${rotationsWith("9999999999")}]}""",
            """{"rotations":[${rotationsWith("null")}]}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(json)) }
        }
    }

    @Test
    fun `it is always available`() {
        game.isAvailable(RoundContext(communityId = community, roundNumber = 1, phase = Phase.ONE)) shouldBe true
    }
}
