package org.unividuell.countdown.core.gamelab

import tools.jackson.module.kotlin.jacksonObjectMapper
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveAtLeastSize
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.gamelab.internal.InvalidGuessException
import org.unividuell.countdown.core.gamelab.internal.SampleDirection
import org.unividuell.countdown.core.gamelab.internal.SampleLabGame
import org.unividuell.countdown.core.gamelab.internal.SampleOutcome
import org.unividuell.countdown.core.gamelab.internal.SamplePayload
import org.unividuell.countdown.core.rng.SeededRandom

class SampleLabGameTest {

    private val game = SampleLabGame()
    private val mapper = jacksonObjectMapper()

    private fun guessOf(value: Int) = mapper.readTree("""{"value":$value}""")

    /**
     * Re-derives the round the same way the game does. The duplication is deliberate: it pins the
     * draw order, so reordering the three draws breaks this test instead of silently changing
     * every round that was ever derived from a stored seed.
     */
    private fun secretOf(seed: Int): Triple<Int, Int, Int> {
        val rng = SeededRandom.fromSeed(seed)
        val lower = rng.nextIntBetween(1, 900)
        val upper = lower + 99
        return Triple(lower, upper, rng.nextIntBetween(lower, upper))
    }

    @Test
    fun `the payload carries exactly the bounds and nothing else`() {
        // THE reference test for every future lab game: pin the field set, so a solution-shaped
        // field cannot be added without a red test. Asserting "the answer is absent" would not
        // catch a field that merely narrows it.
        val json = mapper.writeValueAsString(game.reveal(4711))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("lowerBound", "upperBound")
    }

    @Test
    fun `the same seed reveals the same payload`() {
        game.reveal(4711) shouldBe game.reveal(4711)
    }

    @Test
    fun `different seeds reveal different payloads`() {
        // Sampled rather than hard-coded on two magic seeds, which could collide.
        val distinct = (1..20).map { game.reveal(it) }.distinct()

        distinct shouldHaveAtLeastSize 2
    }

    @Test
    fun `the revealed bounds are a hundred wide and contain the secret`() {
        val (lower, upper, secret) = secretOf(4711)
        val payload = game.reveal(4711) as SamplePayload

        payload.lowerBound shouldBe lower
        payload.upperBound shouldBe upper
        (secret in lower..upper) shouldBe true
    }

    @Test
    fun `scoring the secret is exact`() {
        val (_, _, secret) = secretOf(4711)

        val outcome = game.score(4711, guessOf(secret))

        outcome shouldBe SampleOutcome(correct = true, distance = 0, direction = SampleDirection.EXACT)
    }

    @Test
    fun `a guess below the secret is told the target is higher`() {
        val (lower, _, secret) = secretOf(4711)
        val below = (secret - 3).coerceAtLeast(lower)

        val outcome = game.score(4711, guessOf(below))

        outcome.direction shouldBe SampleDirection.HIGHER
        outcome.distance shouldBe (secret - below)
        outcome.correct shouldBe false
    }

    @Test
    fun `a guess above the secret is told the target is lower`() {
        val (_, upper, secret) = secretOf(4711)
        val above = (secret + 3).coerceAtMost(upper)

        val outcome = game.score(4711, guessOf(above))

        outcome.direction shouldBe SampleDirection.LOWER
        outcome.distance shouldBe (above - secret)
    }

    @Test
    fun `a guess outside the revealed bounds is rejected`() {
        val (lower, _, _) = secretOf(4711)

        shouldThrow<InvalidGuessException> { game.score(4711, guessOf(lower - 1)) }
    }

    @Test
    fun `a guess that is not a number is rejected`() {
        // The game validates its own guess shape; the generic controller must not have to know it.
        shouldThrow<InvalidGuessException> { game.score(4711, mapper.readTree("""{"value":"seven"}""")) }
    }

    @Test
    fun `a guess without the value field is rejected`() {
        shouldThrow<InvalidGuessException> { game.score(4711, mapper.readTree("""{}""")) }
    }
}
