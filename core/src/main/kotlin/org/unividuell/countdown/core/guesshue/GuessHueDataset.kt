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
     * **The draw order is a contract.** Entry, jitter, saturation, lightness, init angle — reorder
     * them and every round ever derived from a stored seed changes retroactively.
     *
     * Only the existing [SeededRandom] API is used. A new method there would drag new golden
     * vectors along with it, for arithmetic that belongs here instead.
     */
    fun draw(random: SeededRandom): GuessHueTarget {
        val entry = random.pick(entries)
        val jittered = entry.hue + random.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES
        val saturation = SATURATION_MIN + random.nextDouble() * (SATURATION_MAX - SATURATION_MIN)
        val lightness = LIGHTNESS_MIN + random.nextDouble() * (LIGHTNESS_MAX - LIGHTNESS_MIN)
        val initHue = random.nextDouble() * 360.0

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
