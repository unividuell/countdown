package org.unividuell.countdown.core.deduster

import org.unividuell.countdown.core.imagepool.AspectRatio

/**
 * The grid a round is played on and the ratio its photo is cropped to. The tile count is fixed —
 * 48 or 49 — because average reaction times are only comparable across rounds of the same length;
 * the grid follows the photo's shape instead, since the pool is fed by phone cameras.
 */
enum class DedusterGrid(val cols: Int, val rows: Int, val aspect: AspectRatio) {
    LANDSCAPE(cols = 8, rows = 6, aspect = AspectRatio.LANDSCAPE),
    PORTRAIT(cols = 6, rows = 8, aspect = AspectRatio.PORTRAIT),
    SQUARE(cols = 7, rows = 7, aspect = AspectRatio.SQUARE),
    ;

    val ratioWidth: Int get() = aspect.width
    val ratioHeight: Int get() = aspect.height
    val tiles: Int get() = cols * rows

    companion object {
        fun of(width: Int, height: Int): DedusterGrid {
            val aspect = AspectRatio.of(width = width, height = height)
            return entries.single { it.aspect == aspect }
        }

        /** The grid a round's frozen `cols`/`rows` were drawn as. */
        fun ofLayout(cols: Int, rows: Int): DedusterGrid = entries.single { it.cols == cols && it.rows == rows }
    }
}
