package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.PALETTE_SIZE
import kotlin.math.cbrt
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Four greys, `delta` apart on the white→black ramp, interpolated in L\* between the two ends.
 *
 * A port of the original's grey-scale mode (`useFindPatternGameColor`, branch `distance <= 1`), and
 * deliberately a faithful one: the difficulty values in `FindPatternLayout` were calibrated by
 * playing against chroma-js's output, so the tones have to be chroma's tones. That is also why the
 * constants below are chroma's own `LAB_CONSTANTS` rather than the textbook CIE ones — chroma
 * approximates the linear segment with `t0..t3`, and a "more correct" formula here would move
 * every tone by a channel or two and quietly recalibrate the game.
 *
 * Interpolating in LCH reduces to interpolating L\* because a grey has no chroma and no hue, so the
 * four steps are perceptually even — which is the whole point at a delta of 0.1.
 *
 * `pow`/`cbrt` are fine here: this runs on the JVM only, and no browser recomputes it (see
 * cross-runtime-parity.md). The client is handed the finished hex strings.
 */
object FindPatternPalette {

    fun of(reference: Double, delta: Double): List<String> {
        val half = delta / 2
        val centre = reference.coerceIn(minimumValue = half, maximumValue = 1.0 - half)
        val from = lightnessOfRamp(centre - half)
        val to = lightnessOfRamp(centre + half)
        return (0 until PALETTE_SIZE).map { step ->
            hexOfLightness(from + (to - from) * step / (PALETTE_SIZE - 1))
        }
    }

    /** `chroma.scale()` with no arguments is white→black, interpolated in RGB. */
    private fun lightnessOfRamp(position: Double): Double = lightnessOf(255.0 * (1.0 - position))

    private fun lightnessOf(channel: Double): Double {
        val y = linear(channel / 255.0)
        return 116.0 * xyzToLab(y) - 16.0
    }

    private fun hexOfLightness(lightness: Double): String {
        val y = labToXyz((lightness + 16.0) / 116.0)
        val channel = (gamma(y) * 255.0).roundToInt().coerceIn(minimumValue = 0, maximumValue = 255)
        val hex = channel.toString(radix = 16).padStart(length = 2, padChar = '0')
        return "#$hex$hex$hex"
    }

    private fun linear(channel: Double): Double =
        if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)

    private fun gamma(value: Double): Double =
        if (value <= 0.00304) 12.92 * value else 1.055 * value.pow(1.0 / 2.4) - 0.055

    private fun xyzToLab(t: Double): Double = if (t > T3) cbrt(t) else t / T2 + T0

    private fun labToXyz(t: Double): Double = if (t > T1) t * t * t else T2 * (t - T0)

    // chroma-js LAB_CONSTANTS — its own approximation of the linear segment, kept bit-for-bit.
    private const val T0 = 0.137931034
    private const val T1 = 0.206896552
    private const val T2 = 0.12841855
    private const val T3 = 0.008856452
}
