package org.unividuell.countdown.core.copyblocks

object CopyBlocksShape {

    /**
     * Every cell inside the bounding box — block *or* air — must see out along one axis: nothing
     * stands between it and the box's face. Air connected to the outside is not enough (a kinked
     * tunnel is connected but cannot be looked into), and air counts because a hidden cavity is as
     * unsolvable as a hidden block.
     *
     * Sweeps each axis line from both faces inward; a cell is seen until the first block on the line.
     *
     * ```
     *   view →  [ ][ ][#][ ]   cells up to and including # are seen from the left;
     *           [ ][#][ ][ ]   the right face sees the rest — or the line has a blind spot
     * ```
     */
    fun allVisible(cells: Set<Cell>): Boolean {
        val lowX = cells.minOf { it.x }
        val lowY = cells.minOf { it.y }
        val lowZ = cells.minOf { it.z }

        // Row-major over the box: stepping one cell along axis 0, 1 or 2 moves the index by stride[axis].
        val size = intArrayOf(
            cells.maxOf { it.x } - lowX + 1,
            cells.maxOf { it.y } - lowY + 1,
            cells.maxOf { it.z } - lowZ + 1,
        )
        val stride = intArrayOf(size[1] * size[2], size[2], 1)

        val occupied = BooleanArray(size[0] * size[1] * size[2])
        cells.forEach { occupied[(it.x - lowX) * stride[0] + (it.y - lowY) * stride[1] + (it.z - lowZ)] = true }

        val seen = BooleanArray(occupied.size)

        fun sweep(start: Int, step: Int, length: Int) {
            for (i in 0 until length) {
                val at = start + i * step
                seen[at] = true
                if (occupied[at]) return
            }
        }

        for (axis in 0..2) {
            val b = (axis + 1) % 3
            val c = (axis + 2) % 3
            for (u in 0 until size[b]) {
                for (v in 0 until size[c]) {
                    val first = u * stride[b] + v * stride[c]
                    sweep(start = first, step = stride[axis], length = size[axis])
                    sweep(start = first + (size[axis] - 1) * stride[axis], step = -stride[axis], length = size[axis])
                }
            }
        }

        return seen.all { it }
    }
}
