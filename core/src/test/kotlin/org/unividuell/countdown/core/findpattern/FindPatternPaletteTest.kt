package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

/**
 * The palette is a port of chroma-js, not a new idea: the original's difficulty values were
 * calibrated against its output, so they only keep their meaning while the tones match. The golden
 * values below come from chroma-js itself (see the plan's Task 2, step 1).
 *
 * If a channel comes out one off, a constant is wrong — do not widen this into a tolerance. The
 * last four pairs below cover a regression: chroma-js never round-trips a stop's own colour through
 * Lab, it returns that colour unconverted at `t = 0` and `t = 1`. A port that always interpolates,
 * even at the literal endpoints, agrees with chroma everywhere else and disagrees exactly there —
 * these four references land on a ramp position whose raw channel is an exact `.5`, which is where
 * the two approaches diverge.
 */
class FindPatternPaletteTest {

    private val expected = mapOf(
        (0.5 to 0.1) to listOf("#8c8c8c", "#848484", "#7b7b7b", "#737373"),
        (0.5 to 0.2) to listOf("#999999", "#888888", "#777777", "#666666"),
        (0.2 to 0.12) to listOf("#dbdbdb", "#d1d1d1", "#c7c7c7", "#bdbdbd"),
        (0.05 to 0.2) to listOf("#ffffff", "#eeeeee", "#dddddd", "#cccccc"),
        (0.97 to 0.1) to listOf("#1a1a1a", "#131313", "#0b0b0b", "#000000"),
        (0.25 to 0.1) to listOf("#cccccc", "#c3c3c3", "#bbbbbb", "#b3b3b3"),
        (0.35 to 0.1) to listOf("#b3b3b3", "#aaaaaa", "#a1a1a1", "#999999"),
        (0.65 to 0.1) to listOf("#666666", "#5d5d5d", "#555555", "#4c4c4c"),
        (0.8 to 0.2) to listOf("#4c4c4c", "#3b3b3b", "#2a2a2a", "#1a1a1a"),
    )

    @Test
    fun `it reproduces chroma-js for every calibrated pair`() {
        for ((input, tones) in expected) {
            val (reference, delta) = input
            FindPatternPalette.of(reference = reference, delta = delta) shouldBe tones
        }
    }

    @Test
    fun `it always yields four distinct greys`() {
        for (step in 0..100) {
            val tones = FindPatternPalette.of(reference = step / 100.0, delta = 0.1)
            tones shouldHaveSize FindPatternLayout.PALETTE_SIZE
            tones.distinct() shouldHaveSize FindPatternLayout.PALETTE_SIZE
        }
    }

    /** A reference at either end is pulled inwards so the window never leaves the ramp. */
    @Test
    fun `a reference at the edge is clamped, not clipped`() {
        FindPatternPalette.of(reference = 0.0, delta = 0.2) shouldBe
            FindPatternPalette.of(reference = 0.1, delta = 0.2)
        FindPatternPalette.of(reference = 1.0, delta = 0.2) shouldBe
            FindPatternPalette.of(reference = 0.9, delta = 0.2)
    }
}
