package org.unividuell.countdown.core.turnpipes

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * [kinds] and [solution] are indexed by cell; [path] lists the cells from inlet to outlet.
 * [solution] is the rotation of every cell that lays the path.
 */
data class PipeBoard(
    val size: Int,
    val kinds: List<PipeKind>,
    val solution: List<Int>,
    val path: List<Int>,
)

/**
 * Draws boards whose path covers every cell.
 *
 * There is no uniqueness check: with two end pieces a board has at most one leak-free arrangement,
 * so the solution is the only one. See the design spec, "Warum es genau eine Lösung gibt".
 */
object TurnPipesGenerator {

    const val MIN_END_DISTANCE = 3

    private const val SCRAMBLE_ATTEMPTS = 20
    private const val RESTARTS = 50

    /** Draw order: backbite moves, then the inlet coin. Callers continue with [scramble]. */
    fun generate(random: SeededRandom, size: Int): PipeBoard {
        val path = hamiltonianPath(random = random, size = size)

        val kinds = MutableList(size * size) { PipeKind.ELBOW }
        val solution = MutableList(size * size) { 0 }

        path.forEachIndexed { i, cell ->
            val back = if (i > 0) 1 shl directionBetween(size, cell, path[i - 1]) else 0
            val ahead = if (i < path.lastIndex) 1 shl directionBetween(size, cell, path[i + 1]) else 0
            val mask = back or ahead

            val kind = when {
                i == 0 -> PipeKind.INLET
                i == path.lastIndex -> PipeKind.OUTLET
                mask == 0b0101 || mask == 0b1010 -> PipeKind.STRAIGHT
                else -> PipeKind.ELBOW
            }

            kinds[cell] = kind
            solution[cell] = (0..3).first { Pipes.openings(kind, it) == mask }
        }

        return PipeBoard(size = size, kinds = kinds, solution = solution, path = path)
    }

    /** One rotation per cell, drawn again while the board would start solved. */
    fun scramble(random: SeededRandom, board: PipeBoard): List<Int> {
        repeat(SCRAMBLE_ATTEMPTS) {
            val start = List(board.size * board.size) { random.nextInt(4) }
            val flow = PipeFlow.trace(size = board.size, kinds = board.kinds, rotations = start)

            if (!(flow.reached && flow.wet.size == board.size * board.size)) return start
        }

        throw IllegalStateException("no unsolved start in $SCRAMBLE_ATTEMPTS draws")
    }

    /**
     * A snake through every cell, stirred by backbite moves, then stirred on until both ends are
     * border cells at least [MIN_END_DISTANCE] apart.
     *
     * Backbite: bite a neighbour of the tail and reverse the stretch behind it, so the path stays a
     * path through all cells:
     *
     *   a b c d e f      tail f bites c   ->   a b c f e d
     */
    private fun hamiltonianPath(random: SeededRandom, size: Int): List<Int> {
        repeat(RESTARTS) {
            var path = snake(size)

            repeat(20 * size * size) { path = backbite(random = random, size = size, path = path) }

            repeat(100 * size * size) {
                if (endsFit(size = size, a = path.first(), b = path.last())) {
                    return if (random.nextBoolean()) path else path.reversed()
                }

                path = backbite(random = random, size = size, path = path)
            }
        }

        throw IllegalStateException("no path with fitting ends in $RESTARTS restarts")
    }

    /** Row 0 to the right, row 1 to the left, and so on. */
    private fun snake(size: Int): List<Int> = (0 until size).flatMap { y ->
        (0 until size).map { i -> y * size + if (y % 2 == 0) i else size - 1 - i }
    }

    private fun backbite(random: SeededRandom, size: Int, path: List<Int>): List<Int> {
        val oriented = if (random.nextBoolean()) path.reversed() else path
        val tail = oriented.last()

        val bites = (0..3)
            .mapNotNull { Pipes.neighbour(size = size, cell = tail, direction = it) }
            .filter { it != oriented[oriented.lastIndex - 1] }

        val i = oriented.indexOf(bites[random.nextInt(bites.size)])

        return oriented.subList(0, i + 1) + oriented.subList(i + 1, oriented.size).reversed()
    }

    private fun endsFit(size: Int, a: Int, b: Int): Boolean {
        fun onBorder(cell: Int) = cell % size in listOf(0, size - 1) || cell / size in listOf(0, size - 1)

        val distance = Math.abs(a % size - b % size) + Math.abs(a / size - b / size)

        return onBorder(a) && onBorder(b) && distance >= MIN_END_DISTANCE
    }

    private fun directionBetween(size: Int, from: Int, to: Int): Int =
        (0..3).first { Pipes.neighbour(size = size, cell = from, direction = it) == to }
}
