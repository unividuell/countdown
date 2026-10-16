package org.unividuell.countdown.core.copyblocks

/**
 * How a guess sits on the template: `template = turn(guess, turns) + (dx, dy, dz)`, where one
 * quarter turn about the vertical maps `(x, y, z)` to `(z, y, -x)`.
 *
 * `shared/copy-blocks/fit.json` pins this convention for the client, which inverts the fit to draw
 * the solution in the player's own view.
 */
data class Fit(val turns: Int, val dx: Int, val dy: Int, val dz: Int) {

    init {
        require(turns in 0..3) { "turns must be in 0..3, was $turns" }
    }

    /** Turns, then shifts. */
    fun toTemplate(cell: Cell): Cell {
        val turned = cell.turned(quarters = turns)

        return Cell(x = turned.x + dx, y = turned.y + dy, z = turned.z + dz)
    }

    /** Shifts back, then turns the remaining way round to a full circle. */
    fun toGuess(cell: Cell): Cell =
        Cell(x = cell.x - dx, y = cell.y - dy, z = cell.z - dz).turned(quarters = (4 - turns) % 4)

    companion object {
        val IDENTITY = Fit(turns = 0, dx = 0, dy = 0, dz = 0)
    }
}

private fun Cell.turned(quarters: Int): Cell = when (quarters) {
    0 -> this
    1 -> Cell(x = z, y = y, z = -x)
    2 -> Cell(x = -x, y = y, z = -z)
    else -> Cell(x = -z, y = y, z = x)
}
