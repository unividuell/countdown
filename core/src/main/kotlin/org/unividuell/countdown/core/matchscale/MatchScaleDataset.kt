package org.unividuell.countdown.core.matchscale

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.abs

/**
 * The loaded categories. The module's public surface: the game adapter gets this bean and draws
 * its round from it.
 *
 * `open`, members too: spring-modulith-observability wraps a module's API beans in a CGLIB subclass.
 */
open class MatchScaleDataset(open val categories: List<MatchScaleCategory>) {

    /**
     * **The draw order is a contract.** [presentation] draws the category, then A, then B. Reorder
     * and every round derived from the same seed changes.
     *
     * [used] maps a category key to the names already drawn in this edition (A and B alike). The
     * pool is the unused entries that still have an unused partner; when none is left, the block is
     * lifted and every entry with a partner is eligible again, so a draw never gives up.
     *
     * Only the presentation stream is used: the pair is shown to everybody, and the round's secret
     * lies elsewhere.
     */
    open fun draw(presentation: SeededRandom, used: Map<String, Set<String>>): MatchScalePair {
        val category = presentation.pick(categories)
        val taken = used[category.key].orEmpty()

        val unused = category.entries.filter { it.name !in taken }
        var pool = unused.filter { entry -> unused.any { it != entry && withinFactor(entry, it) } }
        if (pool.isEmpty()) {
            pool = category.entries.filter { entry -> category.entries.any { it != entry && withinFactor(entry, it) } }
        }

        val a = presentation.pick(pool)
        val b = presentation.pick(pool.filter { it != a && withinFactor(a, it) })

        return MatchScalePair(category = category, a = a, b = b)
    }

    companion object {
        /** Largest ratio between two silhouettes' real sizes that still makes a fair round. */
        const val MAX_FACTOR = 10.0

        private const val EPSILON = 1e-9

        /**
         * Whether two entries form a pair. Inclusive, with an epsilon: 0.3 against 3.0 is a ratio of
         * 0.0999… in floating point and still counts as one tenth.
         */
        fun withinFactor(a: MatchScaleEntry, b: MatchScaleEntry): Boolean {
            val ratio = b.metresPerUnit / a.metresPerUnit
            return ratio >= 1 / MAX_FACTOR - EPSILON && ratio <= MAX_FACTOR + EPSILON
        }
    }
}
