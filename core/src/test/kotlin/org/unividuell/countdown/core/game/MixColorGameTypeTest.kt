package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.MixColorGameType
import org.unividuell.countdown.core.game.internal.MixColorGlass
import org.unividuell.countdown.core.game.internal.MixColorOutcome
import org.unividuell.countdown.core.game.internal.MixColorParams
import org.unividuell.countdown.core.game.internal.MixColorPayload
import org.unividuell.countdown.core.mixcolor.Pigment
import org.unividuell.countdown.core.mixcolor.deltaE
import org.unividuell.countdown.core.mixcolor.mixHex
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class MixColorGameTypeTest {

    private val mapper = JsonMapper.builder().build()
    private val game = MixColorGameType()

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(phase: Phase = Phase.ONE) = RoundContext(
        communityId = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de"),
        roundNumber = 12,
        phase = phase,
        previousParams = emptyList(),
        difficulty = 0.0,
    )

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    @Test
    fun `draws two or three pigments, each at least once, within capacity`() {
        for (seed in 1..200) {
            val params = game.draw(random = random(presentation = seed), context = context())

            params.recipe.size shouldBeInRange 2..3
            params.recipe.values.all { it >= 1 } shouldBe true
            params.recipe.values.sum() shouldBeInRange params.recipe.size..20
            (params.recipe.keys - setOf("c", "m", "y", "w", "k")) shouldBe emptySet()
            params.capacity shouldBe 20
            params.targetHex shouldBe mixHex(params.recipe.mapKeys { Pigment.ofKey(it.key)!! })
        }
    }

    @Test
    fun `only presentation moves the draw`() {
        val base = game.draw(random = random(), context = context())

        game.draw(random = random(solution = 77, scene = 88), context = context()) shouldBe base
        game.draw(random = random(presentation = 99), context = context()) shouldNotBe base
    }

    @Test
    fun `tolerance follows the phase`() {
        game.draw(random = random(), context = context(Phase.ONE)).tolerance shouldBe 4.0
        game.draw(random = random(), context = context(Phase.TWO)).tolerance.shouldBeNull()
    }

    @Test
    fun `stages follow capacity`() {
        val params = game.draw(random = random(), context = context())

        game.stages(params.copy(capacity = 3)) shouldBe 4
        game.stagesScore(params) shouldBe false
        game.requiresReveal(params) shouldBe false
        game.scoresOnDuration(params) shouldBe false
    }

    @Test
    fun `payload and solution carry exactly their fields`() {
        val params = game.draw(random = random(), context = context())

        fields(game.present(params)) shouldBe setOf("targetHex", "capacity", "pigments")
        fields(game.solution(params)) shouldBe setOf("recipe", "tolerance")

        (game.present(params) as MixColorPayload).pigments.map { it.key }
            .shouldContainExactly("c", "m", "y", "w", "k")
        game.solution(params).recipe shouldBe params.recipe
    }

    private fun json(text: String) = mapper.readTree(text)

    private fun drops(vararg keys: String) = keys.map { json("""{"base":"$it"}""") }

    private fun glass(vararg keys: String) = mixHex(keys.groupingBy { Pigment.ofKey(it)!! }.eachCount())!!

    private fun params(recipe: Map<String, Int> = mapOf("c" to 1, "m" to 1), tolerance: Double? = 4.0) =
        MixColorParams(
            recipe = recipe,
            targetHex = mixHex(recipe.mapKeys { Pigment.ofKey(it.key)!! })!!,
            capacity = 20,
            tolerance = tolerance,
        )

    private fun judge(params: MixColorParams, steps: List<JsonNode?>, guess: String = """{"drops":${steps.size}}""") =
        game.judge(
            params = params, guess = json(guess),
            context = GuessContext(sinceRevealMs = null, playId = null, steps = steps),
        )

    @Test
    fun `a drop answers the glass after it`() {
        val answer = game.step(
            params = params(), stage = 1, input = json("""{"base":"y"}"""),
            context = StepContext(earlier = drops("c")),
        )

        answer shouldBe MixColorGlass(hex = glass("c", "y"))
    }

    @Test
    fun `a malformed drop is refused`() {
        for (text in listOf("null", "{}", """{"base":"x"}""", """{"base":"c","n":1}""", """{"base":1}""", "\"c\"", "[1]")) {
            shouldThrow<InvalidStepException> {
                game.step(
                    params = params(), stage = 0, input = json(text), context = StepContext(earlier = emptyList()),
                )
            }
        }
        shouldThrow<InvalidStepException> {
            game.step(params = params(), stage = 0, input = null, context = StepContext(earlier = emptyList()))
        }
    }

    @Test
    fun `judge scores the stored glass`() {
        val p = params()
        val judgement = judge(p, drops("c", "y"))

        judgement.deviation shouldBe deltaE(glass("c", "y"), p.targetHex)
        judgement.outcome shouldBe MixColorOutcome(
            hex = glass("c", "y"), recipe = mapOf("c" to 1, "y" to 1),
            deviation = judgement.deviation, withinTolerance = judgement.qualifies,
        )
        judgement.guess shouldBe json("""{"drops":2}""")
    }

    @Test
    fun `a perfect glass is zero and ratios tie bit for bit`() {
        judge(params(), drops("c", "m")).deviation shouldBe 0.0
        judge(params(), drops("c", "m", "c", "m")).deviation shouldBe 0.0
    }

    @Test
    fun `the gate is 4,0 in phase one`() {
        val p = params(recipe = mapOf("c" to 1, "y" to 1))
        // Found by scan against c:1 y:1: c1 y2 k1 -> 3.787, c2 y2 k1 -> 4.005.
        val below = drops("c", "y", "y", "k")
        val above = drops("c", "c", "y", "y", "k")
        deltaE(glass("c", "y", "y", "k"), p.targetHex) shouldBe (3.7874 plusOrMinus 1e-4)
        deltaE(glass("c", "c", "y", "y", "k"), p.targetHex) shouldBe (4.0047 plusOrMinus 1e-4)

        judge(p, below).qualifies shouldBe true
        (judge(p, below).outcome as MixColorOutcome).withinTolerance shouldBe true
        judge(p, above).qualifies shouldBe false
        (judge(p, above).outcome as MixColorOutcome).withinTolerance shouldBe false

        val two = p.copy(tolerance = null)
        judge(two, above).qualifies shouldBe true
        (judge(two, above).outcome as MixColorOutcome).withinTolerance.shouldBeNull()
    }

    @Test
    fun `judge refuses an empty glass, a count that differs and a corrupt step`() {
        shouldThrow<InvalidGuessException> { judge(params(), emptyList()) }
        shouldThrow<InvalidGuessException> { judge(params(), drops("c"), """{"drops":2}""") }
        for (g in listOf("{}", """{"drops":"1"}""", """{"drops":1.5}""", """{"drops":-1}""", """{"drops":1,"x":1}""")) {
            shouldThrow<InvalidGuessException> { judge(params(), drops("c"), g) }
        }
        shouldThrow<InvalidGuessException> { judge(params(), drops("c") + json("""{"base":"x"}""")) }
        shouldThrow<InvalidGuessException> { judge(params(), drops("c") + null) }
    }

    @Test
    fun `step answer and outcome carry exactly their fields, never the recipe`() {
        fields(MixColorGlass(hex = "#000000")) shouldBe setOf("hex")

        val judgement = judge(params(), drops("c", "m"))
        fields(judgement.outcome) shouldBe setOf("hex", "recipe", "deviation", "withinTolerance")
    }
}
