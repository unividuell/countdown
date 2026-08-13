package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThan
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotBeEmpty
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.internal.GuessHueGameType
import org.unividuell.countdown.core.game.internal.GuessHueOutcome
import org.unividuell.countdown.core.game.internal.GuessHueSolution
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class GuessHueGameTypeTest(@Autowired val game: GuessHueGameType) {

    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
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
    fun `nothing the player sees moves when only the secret stream changes`() {
        // Replaces the old identity check and the rounded-offset heuristic: with two streams the
        // property is provable rather than approximated. A payload field derived from `hue` in any
        // way — copy, fixed offset, hash — would move here, because `hue` does.
        val drawn = (1..20).map { seed -> draw(phase = Phase.ONE, seed = seed) }

        drawn.map { game.present(it) }.distinct() shouldHaveSize 1
        drawn.map { it.hue }.distinct().size shouldBeGreaterThan 1
    }

    private fun guess(hue: Double) = mapper.readTree("""{"hue":$hue}""")

    @Test
    fun `in phase one the tolerance is the gate`() {
        val params = draw(phase = Phase.ONE)

        val inside = game.judge(params = params, guess = guess(params.hue))
        val outside = game.judge(params = params, guess = guess((params.hue + 40.0) % 360.0))

        inside.qualifies shouldBe true
        inside.deviation shouldBe (0.0 plusOrMinus 1e-9)
        outside.qualifies shouldBe false
        outside.deviation shouldBe (40.0 plusOrMinus 1e-9)
    }

    @Test
    fun `in phase two there is no gate at all, however far off the guess is`() {
        // Phase two has no tolerance: everybody qualifies and the closest one wins, which is the
        // framework's job. A guess 179 degrees off is still a candidate.
        val params = draw(phase = Phase.TWO)

        val judgement = game.judge(params = params, guess = guess((params.hue + 179.0) % 360.0))

        judgement.qualifies shouldBe true
        judgement.deviation shouldBe (179.0 plusOrMinus 1e-9)
    }

    @Test
    fun `the distance is symmetric - the shorter way round the wheel, in both directions`() {
        val params = draw(phase = Phase.ONE).copy(hue = 10.0)

        // 350 to 10 is 20 degrees the short way, not 340.
        game.judge(params = params, guess = guess(350.0)).deviation shouldBe (20.0 plusOrMinus 1e-9)
        game.judge(params = params.copy(hue = 350.0), guess = guess(10.0))
            .deviation shouldBe (20.0 plusOrMinus 1e-9)
    }

    @Test
    fun `the outcome is what the player is told, in the game's own words`() {
        val params = draw(phase = Phase.ONE)

        val hit = game.judge(params = params, guess = guess(params.hue)).outcome as GuessHueOutcome
        val phaseTwo = game.judge(params = draw(phase = Phase.TWO), guess = guess(0.0)).outcome as GuessHueOutcome

        hit.deviationDeg shouldBe (0.0 plusOrMinus 1e-9)
        hit.withinTolerance shouldBe true
        // No gate in phase two, so there is nothing to be inside of — null rather than a made-up true.
        phaseTwo.withinTolerance.shouldBeNull()
    }

    @Test
    fun `a malformed guess is rejected before anything can be written`() {
        val params = draw(phase = Phase.ONE)

        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = mapper.readTree("""{}""")) }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"hue":"warm"}"""))
        }
        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(360.0)) }
        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(-0.5)) }
    }

    @Test
    fun `the solution carries exactly the answer and the arc, and nothing else`() {
        // Second exit out of the server, pinned like the payload: a field added here reaches every
        // player who has guessed.
        val json = mapper.writeValueAsString(game.solution(draw(phase = Phase.ONE)))

        mapper.readTree(json).propertyNames().toSet() shouldBe setOf("targetHue", "toleranceDeg")
    }

    @Test
    fun `phase two has no arc to draw`() {
        val params = draw(phase = Phase.TWO)

        val solution = game.solution(params) as GuessHueSolution

        solution.targetHue shouldBe params.hue
        solution.toleranceDeg.shouldBeNull()
    }
}
