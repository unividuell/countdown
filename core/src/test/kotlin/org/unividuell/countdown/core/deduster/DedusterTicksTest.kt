package org.unividuell.countdown.core.deduster

import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class DedusterTicksTest {

    @Test
    fun `every drawn tempo is one the original played`() {
        val scene = SeededRandom.fromSeed(7)
        repeat(500) { DedusterTicks.intervalMs(scene) shouldBeIn DedusterTicks.WEIGHTS.keys }
    }

    @Test
    fun `the median of the original is the most frequent draw`() {
        val scene = SeededRandom.fromSeed(11)
        val counts = List(20_000) { DedusterTicks.intervalMs(scene) }.groupingBy { it }.eachCount()

        counts.maxBy { it.value }.key shouldBe 1300
    }

    @Test
    fun `the table is the original's, verbatim`() {
        DedusterTicks.WEIGHTS shouldBe mapOf(
            900 to 1, 1000 to 4, 1100 to 4, 1200 to 8, 1300 to 9,
            1400 to 3, 1500 to 1, 1800 to 2, 1900 to 1, 2000 to 1,
        )
    }
}
