package org.unividuell.countdown.core.guesshue

/**
 * A drawn round, complete — including the solution.
 *
 * [hue] is the answer and must not leave the server before scoring, not even derived. Only
 * [GuessHueEntry.description] plus [initHue], [saturation] and [lightness] go to the client.
 */
data class GuessHueTarget(
    val entry: GuessHueEntry,
    val hue: Double,
    val saturation: Double,
    val lightness: Double,
    val initHue: Double,
)
