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
     * How far apart the lightest and the darkest tone sit on the ramp — the difficulty.
     * Calibrated by playing the original: 0.2 is easy, 0.12 medium, 0.1 hard.
     */
    const val DELTA_MIN = 0.10
    const val DELTA_MAX = 0.20
}
