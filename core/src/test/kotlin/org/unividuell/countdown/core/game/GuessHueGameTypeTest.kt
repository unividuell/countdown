package org.unividuell.countdown.core.game

import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotBeEmpty
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.internal.GuessHueGameType
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.RoundContext
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class GuessHueGameTypeTest(@Autowired val game: GuessHueGameType) {

    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711) =
        game.draw(
            random = SeededRandom.fromSeed(seed),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "guess-hue"
        game.displayName shouldBe "Farbausmalung"
    }

    @Test
    fun `a drawn round carries the description and a hue inside the wheel`() {
        val params = draw(phase = Phase.ONE)

        params.description.shouldNotBeEmpty()
        params.hue shouldBeGreaterThanOrEqual 0.0
        params.hue shouldBeLessThan 360.0
        params.initHue shouldBeGreaterThanOrEqual 0.0
        params.initHue shouldBeLessThan 360.0
    }

    @Test
    fun `the same seed draws the same round`() {
        draw(phase = Phase.ONE, seed = 99) shouldBe draw(phase = Phase.ONE, seed = 99)
    }

    @Test
    fun `phase one bakes in the inherited tolerance, phase two has no gate at all`() {
        draw(phase = Phase.ONE).toleranceDeg shouldBe GuessHueTolerance.DEGREES
        draw(phase = Phase.TWO).toleranceDeg.shouldBeNull()
    }

    @Test
    fun `the payload carries exactly what the player needs and nothing else`() {
        // Pinning the field SET, not the absence of `hue`: a new field that merely narrows the
        // answer would slip past an "is the solution absent" assertion.
        val json = mapper.writeValueAsString(game.present(draw(phase = Phase.ONE)))

        mapper.readTree(json).propertyNames().toSet() shouldBe
            setOf("description", "initHue", "saturation", "lightness")
    }

    @Test
    fun `the payload's starting angle is not the solution`() {
        val params = draw(phase = Phase.ONE)

        // initHue is drawn independently of the target, so it narrows nothing. If a future change
        // ever derives one from the other, this test is the one that should fail.
        val payload = game.present(params)
        payload.initHue shouldBe params.initHue
        (payload.initHue == params.hue) shouldBe false
    }
}
