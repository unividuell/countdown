package org.unividuell.countdown.core.iam.internal

import org.unividuell.countdown.core.rng.SeededRandom
import java.util.UUID
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The avatar background. Resolved here rather than in the browser because the fallback needs the
 * seeded RNG, and promoting the TS reference implementation out of test scope is a decision with
 * weight (see `webapp-vue/src/lib/rng/__tests__/seededRandom.reference.ts`). Computing it in exactly
 * one place also means there is no cross-runtime parity question at all.
 */
object AvatarColor {
    private const val SATURATION = 0.5
    private const val LIGHTNESS = 0.5

    fun resolve(profileHex: String?, userId: UUID): String =
        profileHex?.takeIf { it.isNotBlank() } ?: derive(userId)

    private fun derive(userId: UUID): String {
        val hue = SeededRandom.fromSeed(userId.toString()).nextIntBetween(0, 359)
        return hslToHex(hue, SATURATION, LIGHTNESS)
    }

    private fun hslToHex(hue: Int, saturation: Double, lightness: Double): String {
        val chroma = (1 - abs(2 * lightness - 1)) * saturation
        val sector = hue / 60.0
        val second = chroma * (1 - abs(sector % 2 - 1))
        val (r, g, b) = when (sector.toInt()) {
            0 -> Triple(chroma, second, 0.0)
            1 -> Triple(second, chroma, 0.0)
            2 -> Triple(0.0, chroma, second)
            3 -> Triple(0.0, second, chroma)
            4 -> Triple(second, 0.0, chroma)
            else -> Triple(chroma, 0.0, second)
        }
        val match = lightness - chroma / 2
        return "#%02x%02x%02x".format(
            ((r + match) * 255).roundToInt(),
            ((g + match) * 255).roundToInt(),
            ((b + match) * 255).roundToInt(),
        )
    }
}
