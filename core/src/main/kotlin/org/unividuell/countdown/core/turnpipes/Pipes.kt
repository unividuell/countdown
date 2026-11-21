package org.unividuell.countdown.core.turnpipes

/** At rotation 0: STRAIGHT opens north and south, ELBOW north and east, INLET and OUTLET north. */
enum class PipeKind(val base: Int) {
    STRAIGHT(base = 0b0101),
    ELBOW(base = 0b0011),
    INLET(base = 0b0001),
    OUTLET(base = 0b0001),
}

/** Cells are row-major, `index = y * size + x`, `(0, 0)` top left. */
object Pipes {

    const val NORTH = 0
    const val EAST = 1
    const val SOUTH = 2
    const val WEST = 3

    /** Bitmask, bit `d` set = open towards `d`. Rotation `r` = `r` quarter turns clockwise. */
    fun openings(kind: PipeKind, rotation: Int): Int {
        val turns = Math.floorMod(rotation, 4)

        return ((kind.base shl turns) or (kind.base shr (4 - turns))) and 0b1111
    }

    /** The cell next to [cell] towards [direction]; `null` beyond the border. */
    fun neighbour(size: Int, cell: Int, direction: Int): Int? {
        val x = cell % size
        val y = cell / size

        return when (direction) {
            NORTH -> if (y == 0) null else cell - size
            EAST -> if (x == size - 1) null else cell + 1
            SOUTH -> if (y == size - 1) null else cell + size
            WEST -> if (x == 0) null else cell - 1
            else -> throw IllegalArgumentException("direction must be in 0..3, was $direction")
        }
    }

    fun opposite(direction: Int): Int = (direction + 2) % 4
}
