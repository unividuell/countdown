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
 * Lab conversion has to match chroma's `LAB_CONSTANTS`, including its non-standard `t0..t3`.
 */
class FindPatternPaletteTest {

    private val expected = mapOf(
        (0.5 to 0.1) to listOf("#8c8c8c", "#848484", "#7b7b7b", "#737373"),
        (0.5 to 0.2) to listOf("#999999", "#888888", "#777777", "#666666"),
        (0.2 to 0.12) to listOf("#dbdbdb", "#d1d1d1", "#c7c7c7", "#bdbdbd"),
        (0.05 to 0.2) to listOf("#ffffff", "#eeeeee", "#dddddd", "#cccccc"),
        (0.97 to 0.1) to listOf("#1a1a1a", "#131313", "#0b0b0b", "#000000"),
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
