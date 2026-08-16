package org.unividuell.countdown.core.guesshue

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The loaded, validated list. The module's public surface: the game framework built on top of it
 * gets this bean and draws its round from it.
 *
 * Immutable and stateless — the randomness lives in the [SeededRandom] passed in, never here.
 */
class GuessHueDataset(val entries: List<GuessHueEntry>) {

    /**
     * **The draw order is a contract, per stream.** [presentation] draws entry, saturation,
     * lightness and start angle in that order; [solution] draws the jitter. Reorder either and every
     * round derived from the same pair of seeds changes.
     *
     * Two streams, split by **publication** rather than by importance: everything the player is
     * shown comes from [presentation], and [solution] produces the round's only secret — the jitter.
     * One stream would not do, and not because a published value might equal the answer:
     * `SeededRandom.nextDouble` publishes 53 bits of two consecutive words and the generator's
     * transition is a bijection, so a few published doubles pin the state and let it be stepped
     * **backwards** to whatever the same stream drew for the solution. The entry belongs on the
     * published side for exactly that reason — its description is what the player reads.
     *
     * What remains after the split is not a generator problem: whoever knows the curated dataset can
     * read the nominal hue off the description. That is what game-content.md protects, not this.
     *
     * Only the existing [SeededRandom] API is used. A new method there would drag new golden vectors
     * along with it, for arithmetic that belongs here instead.
     */
    fun draw(solution: SeededRandom, presentation: SeededRandom): GuessHueTarget {
        val entry = presentation.pick(entries)
        val saturation = SATURATION_MIN + presentation.nextDouble() * (SATURATION_MAX - SATURATION_MIN)
        val lightness = LIGHTNESS_MIN + presentation.nextDouble() * (LIGHTNESS_MAX - LIGHTNESS_MIN)
        val initHue = presentation.nextDouble() * 360.0
        val jittered = entry.hue + solution.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES

        return GuessHueTarget(
            entry = entry,
            hue = wrap360(jittered),
            saturation = saturation,
            lightness = lightness,
            initHue = initHue,
        )
    }

    private fun wrap360(degrees: Double) = ((degrees % 360.0) + 360.0) % 360.0

    companion object {
        /**
         * Must stay below the ±10° scoring tolerance. The jitter is what makes a lookup table
         * built from observed rounds unreliable; if it exceeded the tolerance, a player who read
         * the description perfectly could still be marked wrong through no fault of their own.
         */
        const val JITTER_DEGREES = 5.0

        /**
         * Outside this corridor the hue becomes hard to distinguish on the wheel — a very dark or
         * washed-out target doesn't make the game harder, just more random.
         */
        const val SATURATION_MIN = 0.50
        const val SATURATION_MAX = 0.78
        const val LIGHTNESS_MIN = 0.38
        const val LIGHTNESS_MAX = 0.52
    }
}
