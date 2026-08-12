package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldHaveAtLeastSize
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
import kotlin.math.round

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

        // This protects against the identity-copy regression only — wiring `hue` straight into
        // `initHue`. It is not a proof of independence: initHue is drawn from the same SeededRandom
        // stream as hue, so it narrows the solution in the cryptanalytic sense even though it is
        // never equal to it. See the KDoc on GuessHuePayload.
        val payload = game.present(params)
        payload.initHue shouldBe params.initHue
        (payload.initHue == params.hue) shouldBe false
    }

    @Test
    fun `the starting angle's offset from the solution is not fixed across seeds`() {
        // A fixed-offset derivation such as `initHue = (hue + 137) % 360` would pass the identity
        // check above for every seed. Requiring more than one distinct offset across many seeds is
        // what actually catches that class of regression — rounded, because `wrap360`'s double
        // modulo chain (`%` twice, plus an add) leaves ULP-level noise on what is mathematically the
        // exact same offset: an *actual* fixed-offset derivation was observed to produce values like
        // 136.99999999999994 and 137.00000000000006 across seeds, which would satisfy an unrounded
        // "more than one distinct value" check without the offset varying in any way that matters.
        val offsets = (1..20).map { seed ->
            val params = draw(phase = Phase.ONE, seed = seed)
            val offset = ((params.initHue - params.hue) % 360.0 + 360.0) % 360.0
            round(offset * 1_000_000.0) / 1_000_000.0
        }

        offsets.toSet().shouldHaveAtLeastSize(2)
    }
}
