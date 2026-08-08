package org.unividuell.countdown.core.gamelab

import tools.jackson.module.kotlin.jacksonObjectMapper
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.gamelab.internal.GuessHueLabGame
import org.unividuell.countdown.core.gamelab.internal.GuessHuePayload
import org.unividuell.countdown.core.gamelab.internal.InvalidGuessException
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.unividuell.countdown.core.rng.SeededRandom

class GuessHueLabGameTest {

    // Invented entries. Real descriptions are a secret and never appear in this repository —
    // see .claude/guidelines/game-content.md.
    private val dataset = GuessHueDataset(
        listOf(
            GuessHueEntry(hue = 0, difficulty = GuessHueDifficulty.EASY, description = "Testeintrag A."),
            GuessHueEntry(hue = 120, difficulty = GuessHueDifficulty.MEDIUM, description = "Testeintrag B."),
            GuessHueEntry(hue = 210, difficulty = GuessHueDifficulty.HARD, description = "Testeintrag C."),
        ),
    )
    private val game = GuessHueLabGame(dataset)
    private val mapper = jacksonObjectMapper()

    private fun guessOf(raw: String) = mapper.readTree(raw)

    @Test
    fun `the payload carries the description and the starting colour and nothing else`() {
        // Pins the field set, not the absence of the answer: a field that merely narrows the
        // target hue would slip past an "is the answer absent" assertion.
        val json = mapper.writeValueAsString(game.reveal(4711))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("description", "initHue", "saturation", "lightness")
    }

    @Test
    fun `the payload matches what the dataset drew for that seed`() {
        // Pins the mapping, not the draw order — the adapter must hand on exactly what the dataset
        // produced rather than derive anything of its own. The draw order itself is a contract of
        // the `guesshue` module and is pinned there, by GuessHueDrawTest.
        val target = dataset.draw(SeededRandom.fromSeed(4711))

        val payload = game.reveal(4711) as GuessHuePayload

        payload.description shouldBe target.entry.description
        payload.initHue shouldBe target.initHue
        payload.saturation shouldBe target.saturation
        payload.lightness shouldBe target.lightness
    }

    @Test
    fun `the same seed reveals the same payload`() {
        game.reveal(4711) shouldBe game.reveal(4711)
    }

    @Test
    fun `the starting angle stays on the circle`() {
        val angles = (1..50).map { (game.reveal(it) as GuessHuePayload).initHue }

        // Checked in plain arithmetic and asserted once — an assertion per draw would measure the
        // harness rather than the subject.
        angles.min() shouldBeGreaterThanOrEqualTo 0.0
        angles.max() shouldBeLessThan 360.0
    }

    @Test
    fun `a valid guess is accepted and not scored`() {
        game.score(4711, guessOf("""{"hue":214.37}""")).shouldBeNull()
    }

    @Test
    fun `a guess without the hue field is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{}""")) }
    }

    @Test
    fun `a guess that is not a number is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":"blau"}""")) }
    }

    @Test
    fun `a negative angle is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":-0.1}""")) }
    }

    @Test
    fun `a full turn is rejected because it is the same angle as zero`() {
        shouldThrow<InvalidGuessException> { game.score(4711, guessOf("""{"hue":360.0}""")) }
    }

    @Test
    fun `the others stay hidden until the viewer has guessed`() {
        // Without scoring, another tester's angle is the only signal in the round — and a strong
        // one, because they read the same description.
        game.revealsOthersBeforeGuess shouldBe false
    }
}
