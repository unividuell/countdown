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
 * constants below are the standard CIE L\*a\*b\* piecewise-linear-segment constants (`4/29`, `6/29`
 * and their powers) rather than a "more correct" reformulation — chroma-js uses the same values
 * under different names (`kE`, `kK`), and any other formula would move every tone by a channel or
 * two and quietly recalibrate the game.
 *
 * Interpolating in LCH reduces to interpolating L\* because a grey has no chroma and no hue, so the
 * four steps are perceptually even — which is the whole point at a delta of 0.1.
 *
 * The two literal endpoints (`step == 0` and `step == PALETTE_SIZE - 1`) are not run through this
 * interpolation: chroma-js's scale generator returns a stop's own colour object unconverted when the
 * sample position lands exactly on it (`chroma-js/src/generator/scale.js`, the `col = _colors[i]`
 * branch), so the endpoint hex is the raw white→black ramp value, never round-tripped through Lab.
 * That distinction is bit-exact, not cosmetic: the round trip is lossy (e.g. `178.5` comes back as
 * `178.49999999999997`), which silently flips `roundToInt()` at every ramp position whose true value
 * sits exactly on a `.5` tie.
 *
 * `pow`/`cbrt` are fine here: this runs on the JVM only, and no browser recomputes it (see
 * cross-runtime-parity.md). The client is handed the finished hex strings.
 */
object FindPatternPalette {

    fun of(reference: Double, delta: Double): List<String> {
        val half = delta / 2
        val centre = reference.coerceIn(minimumValue = half, maximumValue = 1.0 - half)
        val from = centre - half
        val to = centre + half
        val fromLightness = lightnessOfRamp(from)
        val toLightness = lightnessOfRamp(to)
        return (0 until PALETTE_SIZE).map { step ->
            when (step) {
                0 -> hexOfRamp(from)
                PALETTE_SIZE - 1 -> hexOfRamp(to)
                else -> hexOfLightness(
                    fromLightness + (toLightness - fromLightness) * step / (PALETTE_SIZE - 1),
                )
            }
        }
    }

    /** `chroma.scale()` with no arguments is white→black, interpolated in RGB. */
    private fun lightnessOfRamp(position: Double): Double = lightnessOf(channelOfRamp(position))

    /**
     * chroma-js's RGB lerp is `c0 + f * (c1 - c0)` (`chroma-js/src/interpolator/rgb.js`), not the
     * algebraically equal `c0 * (1 - f) + c1 * f` — the two round differently in IEEE 754 double
     * arithmetic, and only the former reproduces chroma bit-for-bit at the ramp's raw endpoints.
     */
    private fun channelOfRamp(position: Double): Double = 255.0 + position * (0.0 - 255.0)

    /** The ramp's raw channel, hexed directly — chroma's untouched-stop passthrough at `t = 0, 1`. */
    private fun hexOfRamp(position: Double): String = hexOfChannel(channelOfRamp(position))

    private fun lightnessOf(channel: Double): Double {
        val y = linear(channel / 255.0)
        return 116.0 * xyzToLab(y) - 16.0
    }

    private fun hexOfLightness(lightness: Double): String {
        val y = labToXyz((lightness + 16.0) / 116.0)
        return hexOfChannel(gamma(y) * 255.0)
    }

    private fun hexOfChannel(channel: Double): String {
        val rounded = channel.roundToInt().coerceIn(minimumValue = 0, maximumValue = 255)
        val hex = rounded.toString(radix = 16).padStart(length = 2, padChar = '0')
        return "#$hex$hex$hex"
    }

    private fun linear(channel: Double): Double =
        if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)

    private fun gamma(value: Double): Double =
        if (value <= 0.0031308) 12.92 * value else 1.055 * value.pow(1.0 / 2.4) - 0.055

    private fun xyzToLab(t: Double): Double = if (t > T3) cbrt(t) else t / T2 + T0

    private fun labToXyz(t: Double): Double = if (t > T1) t * t * t else T2 * (t - T0)

    // The CIE L*a*b* piecewise-linear-segment constants: T0 = 4/29, T1 = 6/29, T2 = 3*T1*T1,
    // T3 = T1*T1*T1. chroma-js's own lab-constants.js defines these four under the same names and
    // values, but its rgb2lab/lab2rgb use the algebraically equivalent kE = 216/24389 (= T3) and
    // kK = 24389/27 (= 116/T2) instead — not an approximation, the same constants under other names.
    private const val T0 = 0.137931034
    private const val T1 = 0.206896552
    private const val T2 = 0.12841855
    private const val T3 = 0.008856452
}
