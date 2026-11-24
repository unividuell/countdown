package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.MixColorGameType
import org.unividuell.countdown.core.game.internal.MixColorPayload
import org.unividuell.countdown.core.mixcolor.Pigment
import org.unividuell.countdown.core.mixcolor.mixHex
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class MixColorGameTypeTest {

    private val mapper = JsonMapper.builder().build()
    private val game = MixColorGameType(mapper = mapper)

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
}
