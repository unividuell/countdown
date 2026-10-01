package org.unividuell.countdown.core.deduster

/**
 * The grid a round is played on and the ratio its photo is cropped to. The tile count is fixed —
 * 48 or 49 — because average reaction times are only comparable across rounds of the same length;
 * the grid follows the photo's orientation instead, since the pool is fed by phone cameras.
 */
enum class DedusterGrid(val cols: Int, val rows: Int, val ratioWidth: Int, val ratioHeight: Int) {
    LANDSCAPE(cols = 8, rows = 6, ratioWidth = 4, ratioHeight = 3),
    PORTRAIT(cols = 6, rows = 8, ratioWidth = 3, ratioHeight = 4),
    SQUARE(cols = 7, rows = 7, ratioWidth = 1, ratioHeight = 1),
    ;

    val tiles: Int get() = cols * rows

    companion object {
        /** √(4/3) and √(3/4): the geometric means of neighbouring targets — every photo gets the crop that cuts least. */
        private const val LANDSCAPE_FROM = 1.1547
        private const val PORTRAIT_UP_TO = 0.8660

        fun of(width: Int, height: Int): DedusterGrid {
            val ratio = width.toDouble() / height
            return when {
                ratio >= LANDSCAPE_FROM -> LANDSCAPE
                ratio <= PORTRAIT_UP_TO -> PORTRAIT
                else -> SQUARE
            }
        }

        /** The grid a round's frozen `cols`/`rows` were drawn as. */
        fun ofLayout(cols: Int, rows: Int): DedusterGrid = entries.single { it.cols == cols && it.rows == rows }
    }
}
