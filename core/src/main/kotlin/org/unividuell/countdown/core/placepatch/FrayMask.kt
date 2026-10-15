package org.unividuell.countdown.core.placepatch

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

/**
 * The alpha that frays a patch's border: transparent at the edge, opaque inside, the boundary
 * wandering between 35 % and 100 % of the depth — so no crisp edge pins the patch to a cell.
 * Ported from the spike's `frayMask` (branch `claude/find-patch-game-spike`).
 * e.g. a 300 px patch at depth 45: the outermost 16–45 px fade, differently every few px.
 */
object FrayMask {

    /** Share of the patch side that frays. */
    const val DEPTH = 0.15

    fun alpha(width: Int, height: Int, depth: Double, seed: Int): FloatArray {
        if (depth <= 0.0) return FloatArray(width * height) { 1f }

        val random = SeededRandom.fromSeed(seed)
        val coarse = ValueNoise(width = width, height = height, spacing = max(a = 2.0, b = depth), random = random)
        val fine = ValueNoise(width = width, height = height, spacing = max(a = 1.0, b = depth / 4), random = random)
        val soft = max(a = 1.0, b = depth / 4)

        return FloatArray(width * height) { i ->
            val x = i % width
            val y = i / width
            val edge = minOf(x, y, width - 1 - x, height - 1 - y) + 0.5
            val n = 0.65 * coarse.at(x = x, y = y) + 0.35 * fine.at(x = x, y = y)
            ((edge - depth * (0.35 + 0.65 * n)) / soft).coerceIn(minimumValue = 0.0, maximumValue = 1.0).toFloat()
        }
    }
}

/** A smooth random field in [0, 1]: lattice values [spacing] px apart, eased between. */
private class ValueNoise(width: Int, height: Int, private val spacing: Double, random: SeededRandom) {

    private val cols = ceil(width / spacing).toInt() + 2
    private val values = DoubleArray(cols * (ceil(height / spacing).toInt() + 2)) { random.nextDouble() }

    fun at(x: Int, y: Int): Double {
        val gx = x / spacing
        val gy = y / spacing
        val x0 = floor(gx).toInt()
        val y0 = floor(gy).toInt()
        val tx = ease(gx - x0)
        val ty = ease(gy - y0)

        val top = lerp(a = lattice(cx = x0, cy = y0), b = lattice(cx = x0 + 1, cy = y0), t = tx)
        val bottom = lerp(a = lattice(cx = x0, cy = y0 + 1), b = lattice(cx = x0 + 1, cy = y0 + 1), t = tx)
        return lerp(a = top, b = bottom, t = ty)
    }

    private fun lattice(cx: Int, cy: Int) = values[cy * cols + cx]

    private fun ease(t: Double) = t * t * (3 - 2 * t)

    private fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t
}
