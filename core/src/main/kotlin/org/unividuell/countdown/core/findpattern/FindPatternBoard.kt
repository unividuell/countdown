package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.BLOCK_COUNT
import org.unividuell.countdown.core.findpattern.FindPatternLayout.LAST_START_INDEX
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PALETTE_SIZE
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PATTERN_LENGTH
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The round's board and where the sought run hides in it.
 *
 * Which stream each value comes from is the caller's decision and a load-bearing one — the
 * parameter names say it: the board is shown, so it is drawn from the presentation stream; the
 * start index is the answer and comes from the solution stream. See `GameRandom`.
 */
object FindPatternBoard {

    fun blocks(presentation: SeededRandom): List<Int> =
        List(BLOCK_COUNT) { presentation.nextInt(PALETTE_SIZE) }

    /**
     * Two draws, both from `presentation` because the difficulty is visible in the board: first
     * which band, then the value inside it. The bands are 0.02, 0.04 and 0.03 wide, so a single
     * uniform draw over the whole interval would favour medium and starve hard; drawing the band
     * first is what makes each roughly a third instead.
     */
    fun delta(presentation: SeededRandom): Double {
        val band = presentation.pick(FindPatternDifficulty.entries)
        return band.lower + presentation.nextDouble() * (band.upper - band.lower)
    }

    fun patternStartIndex(solution: SeededRandom): Int = solution.nextInt(LAST_START_INDEX + 1)

    fun patternAt(blocks: List<Int>, startIndex: Int): List<Int> =
        blocks.subList(fromIndex = startIndex, toIndex = startIndex + PATTERN_LENGTH)

    /**
     * Every start index whose run equals [pattern] — the round's „Möglichkeiten". Index arithmetic
     * only, which is why a run may straddle a row boundary: the board is read like a book, and a
     * row is a display decision.
     */
    fun matches(blocks: List<Int>, pattern: List<Int>): List<Int> =
        (0..blocks.size - pattern.size).filter { start ->
            pattern.indices.all { blocks[start + it] == pattern[it] }
        }
}
