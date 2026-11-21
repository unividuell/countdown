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

    /** Whether any category is switched on; without one there is nothing to draw. */
    open val isPlayable: Boolean get() = categories.isNotEmpty()

    /**
     * **The draw order is a contract.** [presentation] draws the category, then the pair, then which
     * of its two entries is A. Reorder and every round derived from the same seed changes.
     *
     * [used] maps a category key to the pairs already drawn in this edition, unordered: `{x, y}`
     * blocks x–y and y–x, while x and y may each come back with another partner. Once every pair
     * of the category is drawn, the block is lifted, so a draw never gives up.
     *
     * Only the presentation stream is used: the pair is shown to everybody, and the round's secret
     * lies elsewhere.
     */
    open fun draw(presentation: SeededRandom, used: Map<String, Set<Set<String>>>): MatchScalePair {
        val category = presentation.pick(categories)
        val drawn = used[category.key].orEmpty()

        val pairs = category.entries.flatMapIndexed { i, a ->
            category.entries.drop(i + 1).filter { withinFactor(a = a, b = it) }.map { a to it }
        }
        val fresh = pairs.filter { (a, b) -> setOf(a.name, b.name) !in drawn }

        val (first, second) = presentation.pick(fresh.ifEmpty { pairs })
        val (a, b) = if (presentation.nextBoolean()) first to second else second to first

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
