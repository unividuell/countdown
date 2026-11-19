package org.unividuell.countdown.core.turnpipes

/** Where water ran dry: into [at] from cell [from]; `at = null` is off the board. */
data class Leak(val at: Int?, val from: Int)

/** [wet] in flow order, starting at the inlet. */
data class Flow(val wet: List<Int>, val reached: Boolean, val leak: Leak?)

object PipeFlow {

    /**
     * Runs water from the inlet. Every tile has two openings (an end piece one), so the water
     * takes exactly one way: it never forks, never loops, never flows back into the inlet.
     */
    fun trace(size: Int, kinds: List<PipeKind>, rotations: List<Int>): Flow {
        var cell = kinds.indexOf(PipeKind.INLET)
        var direction = Integer.numberOfTrailingZeros(Pipes.openings(kind = kinds[cell], rotation = rotations[cell]))
        val wet = mutableListOf(cell)

        // A path never revisits a cell, so size² steps bound it even on a malformed board.
        repeat(size * size) {
            val next = Pipes.neighbour(size = size, cell = cell, direction = direction)
                ?: return Flow(wet = wet, reached = false, leak = Leak(at = null, from = cell))

            val back = Pipes.opposite(direction)
            val openings = Pipes.openings(kind = kinds[next], rotation = rotations[next])

            if (openings and (1 shl back) == 0) {
                return Flow(wet = wet, reached = false, leak = Leak(at = next, from = cell))
            }

            wet += next

            if (kinds[next] == PipeKind.OUTLET) return Flow(wet = wet, reached = true, leak = null)

            direction = Integer.numberOfTrailingZeros(openings and (1 shl back).inv())
            cell = next
        }

        return Flow(wet = wet, reached = false, leak = null)
    }
}
