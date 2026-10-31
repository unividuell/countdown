package org.unividuell.countdown.core.echolocate

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.hypot

/** A cell counted from the top-left corner; its centre sits at (col + 0.5, row + 0.5). */
data class Cell(val col: Int, val row: Int)

enum class NoiseKind { BIRDS, BROOK, COW, WIND, RAIN }

data class NoiseSource(val cell: Cell, val kind: NoiseKind)

/** What a round hides: one target per clip, in clip order, and the noise sources. */
data class Layout(val targets: List<Cell>, val noises: List<NoiseSource>)

object FieldLayout {

    /**
     * Kept flexible: a round freezes its own numbers, and everything after the draw reads them
     * from there — changing these reaches new rounds only.
     */
    const val ATTEMPTS = 200
    const val MIN_SOURCE_DISTANCE = 2.0
    const val MIN_CLIP_DISTANCE = 5.0

    val KINDS = listOf(NoiseKind.BIRDS, NoiseKind.BROOK, NoiseKind.COW, NoiseKind.WIND, NoiseKind.RAIN)

    /**
     * Targets first, then the noise, so the first target of a seed is the same for one clip and
     * for two. Kinds go round: BIRDS, BROOK, COW, WIND, RAIN, BIRDS, …
     */
    fun place(random: SeededRandom, grid: Int, clips: Int, noises: Int): Layout {
        val targets = mutableListOf<Cell>()
        repeat(clips) {
            targets += draw(random = random, grid = grid) { cell ->
                targets.all { distance(a = cell, b = it) >= MIN_CLIP_DISTANCE }
            }
        }

        val sources = targets.toMutableList()
        val noiseSources = List(noises) { i ->
            val cell = draw(random = random, grid = grid) { cell ->
                sources.all { distance(a = cell, b = it) >= MIN_SOURCE_DISTANCE }
            }
            sources += cell

            NoiseSource(cell = cell, kind = KINDS[i % KINDS.size])
        }

        return Layout(targets = targets, noises = noiseSources)
    }

    /** The first of [ATTEMPTS] draws that [fits]; if none does, the last one — it must terminate. */
    private fun draw(random: SeededRandom, grid: Int, fits: (Cell) -> Boolean): Cell {
        var cell: Cell
        var attempt = 0

        do {
            cell = Cell(col = random.nextInt(grid), row = random.nextInt(grid))
            attempt++
        } while (attempt < ATTEMPTS && !fits(cell))

        return cell
    }

    private fun distance(a: Cell, b: Cell): Double =
        hypot(x = (a.col - b.col).toDouble(), y = (a.row - b.row).toDouble())
}
