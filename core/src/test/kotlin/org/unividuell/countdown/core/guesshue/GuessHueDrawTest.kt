package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.comparables.shouldBeLessThanOrEqualTo
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.abs
import kotlin.math.min

class GuessHueDrawTest {

    private val dataset = GuessHueDataset(
        (0 until 12).flatMap { sector ->
            val base = sector * 30
            listOf(
                GuessHueEntry(base + 2, GuessHueDifficulty.EASY, "Beispieleintrag, kein Spielinhalt. Praktisch daneben, keinen Fingerbreit weiter."),
                GuessHueEntry(base + 14, GuessHueDifficulty.MEDIUM, "Beispieleintrag, kein Spielinhalt. Auf der einen Seite, nicht auf der anderen."),
                GuessHueEntry(base + 26, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt."),
            )
        },
    )

    private fun distanceOnCircle(a: Double, b: Double): Double {
        val raw = abs(a - b)
        return min(raw, 360.0 - raw)
    }

    @Test
    fun `draws entry, jitter, saturation, lightness and init hue in exactly that order`() {
        // The order is a contract: reordering it changes every round already played. So this
        // checks against a hand-replayed stream instead of magic numbers.
        val reference = SeededRandom.fromSeed("community-42/round-7")
        val expectedEntry = reference.pick(dataset.entries)
        val jitterDraw = reference.nextDouble()
        val saturationDraw = reference.nextDouble()
        val lightnessDraw = reference.nextDouble()
        val initDraw = reference.nextDouble()

        val target = dataset.draw(SeededRandom.fromSeed("community-42/round-7"))

        target.entry shouldBe expectedEntry
        // The parenthesisation must MIRROR the implementation's, not just intend the same value:
        // (0.78 - 0.50) is not, in IEEE754, the same as the literal 0.28, and `shouldBe` on a
        // Double compares exactly. That's the point — the test pins the arithmetic itself.
        target.hue shouldBe (expectedEntry.hue + jitterDraw * (2 * 5.0) - 5.0)
            .let { ((it % 360.0) + 360.0) % 360.0 }
        target.saturation shouldBe 0.50 + saturationDraw * (0.78 - 0.50)
        target.lightness shouldBe 0.38 + lightnessDraw * (0.52 - 0.38)
        target.initHue shouldBe initDraw * 360.0
    }

    @Test
    fun `is reproducible for the same seed`() {
        val first = dataset.draw(SeededRandom.fromSeed(4711))
        val second = dataset.draw(SeededRandom.fromSeed(4711))

        second shouldBe first
    }

    @Test
    fun `keeps the jitter inside the tolerance and the colour inside the corridor`() {
        // The jitter must stay below the plus-or-minus 10 degree tolerance, otherwise a player who
        // reads the description perfectly could still be marked wrong through no fault of their own.
        (0 until 2_000).forEach { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))

            distanceOnCircle(target.hue, target.entry.hue.toDouble()) shouldBeLessThanOrEqualTo 5.0
            target.saturation shouldBeGreaterThanOrEqualTo 0.50
            target.saturation shouldBeLessThan 0.78
            target.lightness shouldBeGreaterThanOrEqualTo 0.38
            target.lightness shouldBeLessThan 0.52
            target.hue shouldBeGreaterThanOrEqualTo 0.0
            target.hue shouldBeLessThan 360.0
            target.initHue shouldBeGreaterThanOrEqualTo 0.0
            target.initHue shouldBeLessThan 360.0
        }
    }

    @Test
    fun `wraps the jitter across zero degrees`() {
        val nearZero = GuessHueDataset(
            listOf(GuessHueEntry(2, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt.")),
        )

        val hues = (0 until 500).map { nearZero.draw(SeededRandom.fromSeed(it)).hue }

        // A nominal value of 2 degrees jitters to both sides of zero, and none of them may go negative.
        hues.any { it > 350.0 } shouldBe true
        hues.all { it >= 0.0 } shouldBe true
    }

    @Test
    fun `the init hue is drawn independently of the target`() {
        // A guaranteed-distant start would leak where the target is NOT, cutting the search space
        // from 360 down to 240 degrees. So the init hue also has to land close sometimes.
        val close = (0 until 5_000).count { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))
            distanceOnCircle(target.initHue, target.hue) < 30.0
        }

        // Under a uniform distribution, roughly one sixth of the init angles fall within 30
        // degrees: expected value ~833, standard deviation ~26 (sqrt(5000 * 1/6 * 5/6)). Both
        // bounds are needed, not just one: the lower bound (~12.6 sigma below) rules out a
        // guaranteed-distant start (e.g. initHue = wrap360(hue + 180)), the upper bound (~13.9
        // sigma above) rules out a start coupled to the target (e.g. initHue = hue, or initHue
        // sharing a draw with lightness). Either bound alone would let through exactly the
        // clustering that independence is supposed to rule out.
        close shouldBeGreaterThanOrEqualTo 500
        close shouldBeLessThanOrEqualTo 1_200
    }

    @Test
    fun `the jitter stays inside the tolerance`() {
        // The inequality is the reason the jitter is 5: a player who read the description
        // perfectly must not be pushed out of the window by the jitter alone. Now that the
        // tolerance is a constant rather than prose, it can be pinned.
        GuessHueDataset.JITTER_DEGREES shouldBeLessThan GuessHueTolerance.DEGREES
    }
}
