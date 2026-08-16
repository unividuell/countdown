package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.comparables.shouldBeLessThanOrEqualTo
import io.kotest.matchers.ints.shouldBeGreaterThan
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

    /**
     * Two streams from one test seed. Independence is what production needs, not what a draw test
     * asserts — these tests are about ranges and distribution, so a derived second seed is enough,
     * as long as it is not the same number (which would make both streams identical).
     */
    private fun drawWith(seed: Int) = dataset.draw(
        solution = SeededRandom.fromSeed(seed),
        presentation = SeededRandom.fromSeed(seed xor 0x5F5F5F5F.toInt()),
    )

    @Test
    fun `draws entry, jitter, saturation, lightness and init hue in exactly that order`() {
        // The order is a contract per stream: reordering either changes every round already played.
        // So this checks against hand-replayed streams instead of magic numbers — presentation for
        // entry, saturation, lightness, init angle, and solution for the jitter alone.
        val solutionRef = SeededRandom.fromSeed("community-42/round-7")
        val presentationRef = SeededRandom.fromSeed("community-42/round-7/p")
        val expectedEntry = presentationRef.pick(dataset.entries)
        val saturationDraw = presentationRef.nextDouble()
        val lightnessDraw = presentationRef.nextDouble()
        val initDraw = presentationRef.nextDouble()
        val jitterDraw = solutionRef.nextDouble()

        val target = dataset.draw(
            solution = SeededRandom.fromSeed("community-42/round-7"),
            presentation = SeededRandom.fromSeed("community-42/round-7/p"),
        )

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
        val first = drawWith(4711)
        val second = drawWith(4711)

        second shouldBe first
    }

    @Test
    fun `keeps the jitter inside the tolerance and the colour inside the corridor`() {
        // The jitter must stay below the plus-or-minus 10 degree tolerance, otherwise a player who
        // reads the description perfectly could still be marked wrong through no fault of their own.
        (0 until 2_000).forEach { seed ->
            val target = drawWith(seed)

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

        val hues = (0 until 500).map {
            nearZero.draw(
                solution = SeededRandom.fromSeed(it),
                presentation = SeededRandom.fromSeed(it xor 0x5F5F5F5F.toInt()),
            ).hue
        }

        // A nominal value of 2 degrees jitters to both sides of zero, and none of them may go negative.
        hues.any { it > 350.0 } shouldBe true
        hues.all { it >= 0.0 } shouldBe true
    }

    @Test
    fun `the init hue is drawn independently of the target`() {
        // A guaranteed-distant start would leak where the target is NOT, cutting the search space
        // from 360 down to 240 degrees. So the init hue also has to land close sometimes.
        val close = (0 until 5_000).count { seed ->
            val target = drawWith(seed)
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

    @Test
    fun `the presentation values come from the presentation stream and the hue does not`() {
        // The split is by publication: everything the player is shown is drawn from one stream, the
        // jitter that hides the answer from the other. Holding one stream fixed while varying the
        // other is what proves the split — no rounding, no heuristics.
        val varyingSolution = (1..20).map { seed ->
            dataset.draw(solution = SeededRandom.fromSeed(seed), presentation = SeededRandom.fromSeed(4711))
        }

        varyingSolution.map { Triple(it.entry, it.saturation, it.lightness) }.distinct() shouldHaveSize 1
        varyingSolution.map { it.initHue }.distinct() shouldHaveSize 1
        varyingSolution.map { it.hue }.distinct().size shouldBeGreaterThan 1
    }

    @Test
    fun `a different presentation stream redraws everything the player sees, and nothing else`() {
        val first = dataset.draw(
            solution = SeededRandom.fromSeed(7), presentation = SeededRandom.fromSeed(1),
        )
        val second = dataset.draw(
            solution = SeededRandom.fromSeed(7), presentation = SeededRandom.fromSeed(2),
        )

        // Same secret stream, so the jitter is identical; a different entry means a different hue,
        // which is why only the jitter itself can be compared here.
        (first.initHue == second.initHue) shouldBe false
        (first.hue - first.entry.hue) shouldBe (second.hue - second.entry.hue)
    }
}
