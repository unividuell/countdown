package org.unividuell.countdown.core.findpattern

/**
 * The board's measurements, in one place because four files derive from them: the draw, the palette,
 * the two images and the payload the client lays its cell grid out from.
 *
 * The numbers are the original's (`utils/find-pattern-game-attributes.ts`). Eight columns in
 * portrait is what makes a block big enough to tap on a phone.
 */
object FindPatternLayout {
    const val COLS = 8
    const val ROWS = 14
    const val PATTERN_LENGTH = 4
    const val PALETTE_SIZE = 4

    const val BLOCK_COUNT = COLS * ROWS
    const val LAST_START_INDEX = BLOCK_COUNT - PATTERN_LENGTH

    /**
     * How far apart the lightest and the darkest tone sit on the ramp — the difficulty. The
     * original had no formula: an admin typed a `distance` number per round
     * (`huettehuette.unividuell.org/pages/admin/02-find-pattern/pattern-manager.vue:84`). These
     * bounds are calibrated from 27 played rounds (median and mode 0.12) plus a sweep of rendered
     * boards across the whole range: 0.04 is still playable, 0.12 is already easy. [DELTA_MAX] is
     * an **exclusive** upper bound — 0.11 itself is never drawn — because [FindPatternDifficulty]'s
     * bands are half-open and this is their outer edge.
     */
    const val DELTA_MIN = 0.02
    const val DELTA_MAX = 0.11
}

/**
 * The difficulty as three named half-open bands `[lower, upper)`, tiling `[DELTA_MIN, DELTA_MAX)`
 * with no gaps and no overlap — each band's upper edge is the next band's lower edge, exclusive on
 * one side and inclusive on the other so a boundary value belongs to exactly one band. The names
 * carry no behaviour yet; they exist so a later feature can attach to them.
 */
enum class FindPatternDifficulty(val lower: Double, val upper: Double) {
    HARD(lower = 0.02, upper = 0.04),
    MEDIUM(lower = 0.04, upper = 0.08),
    EASY(lower = 0.08, upper = 0.11),
    ;

    companion object {
        fun of(value: Double): FindPatternDifficulty =
            entries.first { value >= it.lower && value < it.upper }
    }
}
