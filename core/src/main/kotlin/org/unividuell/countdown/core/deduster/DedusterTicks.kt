package org.unividuell.countdown.core.deduster

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * How fast tiles fall. Drawn, not fixed: long is not easy — at 2000 ms a round lasts 96 s and the
 * last tiles meet a concentration long gone — and short is hard the other way.
 */
object DedusterTicks {

    /** The original's Entstauber rounds by tempo in ms (its one 960 ms round counted as 1000). */
    val WEIGHTS: Map<Int, Int> = linkedMapOf(
        900 to 1, 1000 to 4, 1100 to 4, 1200 to 8, 1300 to 9,
        1400 to 3, 1500 to 1, 1800 to 2, 1900 to 1, 2000 to 1,
    )

    fun intervalMs(scene: SeededRandom): Int =
        scene.weightedPick(items = WEIGHTS.keys.toList(), weights = WEIGHTS.values.map { it.toDouble() })
}
