package org.unividuell.countdown.core.placepatch

import org.unividuell.countdown.core.imagepool.AspectRatio
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The board a round is played on: [cols] × [rows] square cells, the patch [size] × [size] of them.
 * e.g. a 4:3 photo at 40 columns → 40 × 30 cells, the patch 10 × 10.
 */
data class PlacePatchLayout(val cols: Int, val rows: Int, val size: Int) {

    /** Pixels per cell for a crop [cropWidth] wide: whole, at most [MAX_CELL_PX], never zero. */
    fun cellPx(cropWidth: Int): Int = max(a = 1, b = min(a = MAX_CELL_PX, b = cropWidth / cols))

    companion object {

        /**
         * Kept flexible: a round freezes its own cols, rows and size, and everything after the draw
         * reads them from there — changing these reaches new rounds only.
         */
        const val COLS = 40
        const val SIZE = 10
        const val MAX_CELL_PX = 30

        fun of(aspect: AspectRatio, cols: Int = COLS, size: Int = SIZE): PlacePatchLayout =
            PlacePatchLayout(
                cols = cols,
                rows = (cols.toDouble() * aspect.height / aspect.width).roundToInt(),
                size = size,
            )
    }
}
