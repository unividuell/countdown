package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThanOrEqual
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
    fun `delta stays inside the calibrated window`() {
        for (seed in 1..200) {
            val delta = FindPatternBoard.delta(SeededRandom.fromSeed(seed))
            delta shouldBeGreaterThanOrEqual FindPatternLayout.DELTA_MIN
            delta shouldBeLessThanOrEqual FindPatternLayout.DELTA_MAX
        }
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
