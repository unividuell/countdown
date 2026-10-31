package org.unividuell.countdown.core.echolocate

import kotlin.math.hypot

/** A point on the field in cell units: (0, 0) is the top-left corner, (grid, grid) the far one. */
data class Pin(val x: Double, val y: Double)

fun distanceToCentre(pin: Pin, cell: Cell): Double =
    hypot(x = pin.x - (cell.col + 0.5), y = pin.y - (cell.row + 0.5))

/**
 * For each target, the index of the pin that serves it. Pins carry no name, so the assignment is the
 * one with the smallest summed distance. A tie keeps the pins' order: equal sums → `[0, 1]`.
 */
fun pinOf(pins: List<Pin>, targets: List<Cell>): List<Int> {
    require(pins.size == targets.size) { "one pin per target, was ${pins.size} pins for ${targets.size} targets" }

    // Lexicographic, so the identity comes first and `minBy` — the first minimum — keeps it on a tie.
    return permutations(pins.indices.toList()).minBy { order ->
        targets.indices.sumOf { i -> distanceToCentre(pin = pins[order[i]], cell = targets[i]) }
    }
}

private fun permutations(items: List<Int>): List<List<Int>> =
    if (items.size <= 1) {
        listOf(items)
    } else {
        items.flatMap { item -> permutations(items - item).map { rest -> listOf(item) + rest } }
    }
