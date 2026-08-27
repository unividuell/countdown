package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThan
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThanOrEqual
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class FindPatternBoardTest {

    @Test
    fun `the board is 112 blocks of four tones`() {
        val blocks = FindPatternBoard.blocks(SeededRandom.fromSeed(4711))

        blocks shouldHaveSize FindPatternLayout.BLOCK_COUNT
        blocks.forEach {
            it shouldBeGreaterThanOrEqual 0
            it shouldBeLessThanOrEqual FindPatternLayout.PALETTE_SIZE - 1
        }
        blocks.distinct() shouldHaveSize FindPatternLayout.PALETTE_SIZE
    }

    @Test
    fun `the same seed draws the same board`() {
        FindPatternBoard.blocks(SeededRandom.fromSeed(99)) shouldBe
            FindPatternBoard.blocks(SeededRandom.fromSeed(99))
    }

    @Test
    fun `DELTA_MIN and DELTA_MAX are the bands' outer edges`() {
        FindPatternLayout.DELTA_MIN shouldBe FindPatternDifficulty.entries.minOf { it.lower }
        FindPatternLayout.DELTA_MAX shouldBe FindPatternDifficulty.entries.maxOf { it.upper }
    }

    /** DELTA_MAX is an exclusive bound: 0.11 itself must never come out of the draw. */
    @Test
    fun `delta lands in the half-open interval, DELTA_MAX itself excluded`() {
        for (seed in 1..500) {
            val delta = FindPatternBoard.delta(SeededRandom.fromSeed(seed))
            delta shouldBeGreaterThanOrEqual FindPatternLayout.DELTA_MIN
            delta shouldBeLessThan FindPatternLayout.DELTA_MAX
        }
    }

    @Test
    fun `the same seed draws the same delta`() {
        FindPatternBoard.delta(SeededRandom.fromSeed(123)) shouldBe
            FindPatternBoard.delta(SeededRandom.fromSeed(123))
    }

    /**
     * The band is picked uniformly among three before the value inside it is drawn, so each band's
     * share of N draws is binomial(N, 1/3). At N = 6000 the standard deviation is
     * sqrt(6000 · 1/3 · 2/3) ≈ 36.5; five standard deviations is ≈ 183, i.e. ±3.05 percentage points
     * around the expected 2000. The seeds are fixed, so this is not a flaky sample — the same 6000
     * draws happen on every run — but the margin still has to be wide enough that a harmless change
     * to the RNG's internals (a different but still-uniform bit consumption) would not trip it.
     */
    @Test
    fun `each band gets close to a third of many draws`() {
        val bands = (1..6000).map { seed ->
            FindPatternDifficulty.of(FindPatternBoard.delta(SeededRandom.fromSeed(seed)))
        }
        val counts = FindPatternDifficulty.entries.associateWith { band -> bands.count { it == band } }

        counts.values.forEach { count ->
            count shouldBeGreaterThanOrEqual 1817 // 2000 - 183
            count shouldBeLessThanOrEqual 2183 // 2000 + 183
        }
    }

    /** The boundaries are half-open — each edge value belongs to the band starting at it. */
    @Test
    fun `a value on a band boundary belongs to the band it opens, not the one it closes`() {
        FindPatternDifficulty.of(0.02) shouldBe FindPatternDifficulty.HARD
        FindPatternDifficulty.of(0.04) shouldBe FindPatternDifficulty.MEDIUM
        FindPatternDifficulty.of(0.08) shouldBe FindPatternDifficulty.EASY
    }

    @Test
    fun `a start index always leaves room for the whole pattern`() {
        for (seed in 1..200) {
            val start = FindPatternBoard.patternStartIndex(SeededRandom.fromSeed(seed))
            start shouldBeGreaterThanOrEqual 0
            start shouldBeLessThanOrEqual FindPatternLayout.LAST_START_INDEX
        }
    }

    /**
     * The original clamped an out-of-range candidate onto the last index, which made that one
     * position more likely than every other. Drawing inside the range instead must spread out.
     */
    @Test
    fun `the last start index is not more likely than the others`() {
        val drawn = (1..2000).map { FindPatternBoard.patternStartIndex(SeededRandom.fromSeed(it)) }

        val onLast = drawn.count { it == FindPatternLayout.LAST_START_INDEX }
        // 109 start indices share 2000 draws, so a fair stream lands near 18. The clamp this test
        // guards against pushed every out-of-range candidate onto the last index, which lands near
        // four times that share.
        onLast shouldBeLessThanOrEqual 2 * 2000 / (FindPatternLayout.LAST_START_INDEX + 1)
    }

    @Test
    fun `the pattern is the run of four at the start index`() {
        val blocks = List(FindPatternLayout.BLOCK_COUNT) { it % 4 }

        FindPatternBoard.patternAt(blocks = blocks, startIndex = 5) shouldContainExactly
            listOf(1, 2, 3, 0)
    }

    @Test
    fun `every occurrence of the pattern is a possibility, wrapped rows included`() {
        val blocks = MutableList(FindPatternLayout.BLOCK_COUNT) { 0 }
        // Two runs: one inside a row, one straddling the row boundary at index 8.
        listOf(2, 3, 4, 5).forEachIndexed { offset, index -> blocks[index] = listOf(1, 2, 3, 1)[offset] }
        listOf(6, 7, 8, 9).forEachIndexed { offset, index -> blocks[index] = listOf(1, 2, 3, 1)[offset] }

        FindPatternBoard.matches(blocks = blocks, pattern = listOf(1, 2, 3, 1)) shouldContainExactly
            listOf(2, 6)
    }

    @Test
    fun `a pattern that occurs nowhere has no possibility`() {
        val blocks = List(FindPatternLayout.BLOCK_COUNT) { 0 }

        FindPatternBoard.matches(blocks = blocks, pattern = listOf(1, 2, 3, 1)) shouldHaveSize 0
    }
}
