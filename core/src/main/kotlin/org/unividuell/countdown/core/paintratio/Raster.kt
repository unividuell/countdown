package org.unividuell.countdown.core.paintratio

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Cells that are empty (`0`) or hold the ARGB painted last. Rasterises row by row and agrees with
 * [covers] cell by cell:
 *
 * ```
 * capsule  the row's interval estimated in Double, both end cells settled by covers
 * area     the edges' crossings with the row as exact fractions, sorted, filled pairwise
 * ```
 */
class Raster(val width: Int, val height: Int) {

    private val pixels = IntArray(width * height)

    fun paint(mark: Mark, argb: Int) {
        require(argb ushr 24 != 0) { "a transparent colour would count cells the PNG does not show" }
        when (mark) {
            is Capsule -> paintCapsule(capsule = mark, argb = argb)
            is Area -> paintArea(area = mark, argb = argb)
        }
    }

    fun cells(): Int = pixels.count { it != 0 }

    fun isPainted(x: Int, y: Int): Boolean = pixels[y * width + x] != 0

    fun png(): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        image.setRGB(0, 0, width, height, pixels, 0, width)
        return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
    }

    private fun paintCapsule(capsule: Capsule, argb: Int) {
        val r = capsule.radius
        if (max(a = capsule.ax, b = capsule.bx) + r < 0 || min(a = capsule.ax, b = capsule.bx) - r >= width) return

        val ax = capsule.ax.toDouble()
        val ay = capsule.ay.toDouble()
        val bx = capsule.bx.toDouble()
        val by = capsule.by.toDouble()
        val dx = bx - ax
        val dy = by - ay
        val len2 = dx * dx + dy * dy
        val reach = r * sqrt(len2)
        val r2 = r.toDouble() * r
        val top = (min(a = capsule.ay, b = capsule.by) - r).coerceAtLeast(0)
        val bottom = (max(a = capsule.ay, b = capsule.by) + r - 1).coerceAtMost(height - 1)

        for (y in top..bottom) {
            val py = y + 0.5
            var lo = Double.POSITIVE_INFINITY
            var hi = Double.NEGATIVE_INFINITY

            // The end discs.
            val ha = r2 - (py - ay) * (py - ay)
            if (ha >= 0) {
                lo = min(a = lo, b = ax - sqrt(ha))
                hi = max(a = hi, b = ax + sqrt(ha))
            }
            val hb = r2 - (py - by) * (py - by)
            if (hb >= 0) {
                lo = min(a = lo, b = bx - sqrt(hb))
                hi = max(a = hi, b = bx + sqrt(hb))
            }

            // The band between them: 0 ≤ (p − a)·d ≤ |d|² along, |(p − a) × d| ≤ r·|d| across.
            val along = (py - ay) * dy
            val across = (py - ay) * dx
            if (len2 > 0 && (dx != 0.0 || along in 0.0..len2) && (dy != 0.0 || abs(across) <= reach)) {
                var from = Double.NEGATIVE_INFINITY
                var to = Double.POSITIVE_INFINITY
                if (dx != 0.0) {
                    val start = ax - along / dx
                    val end = ax + (len2 - along) / dx
                    from = max(a = from, b = min(a = start, b = end))
                    to = min(a = to, b = max(a = start, b = end))
                }
                if (dy != 0.0) {
                    val left = ax + (across - reach) / dy
                    val right = ax + (across + reach) / dy
                    from = max(a = from, b = min(a = left, b = right))
                    to = min(a = to, b = max(a = left, b = right))
                }
                if (from <= to) {
                    lo = min(a = lo, b = from)
                    hi = max(a = hi, b = to)
                }
            }

            if (lo > hi) continue
            // Centres x + ½ within [lo, hi], one cell wider on each side for covers to settle.
            val first = ceil(lo - 0.5).toInt() - 1
            val last = floor(hi - 0.5).toInt() + 1
            fillSettled(capsule = capsule, y = y, from = first, to = last, argb = argb)
        }
    }

    /** Moves each end of the estimate until the rule flips, then fills. A capsule's row is one interval. */
    private fun fillSettled(capsule: Capsule, y: Int, from: Int, to: Int, argb: Int) {
        var lo = from.coerceAtLeast(0)
        var hi = to.coerceAtMost(width - 1)
        if (lo > hi) return

        if (covers(mark = capsule, x = lo, y = y)) {
            while (lo > 0 && covers(mark = capsule, x = lo - 1, y = y)) lo--
        } else {
            do lo++ while (lo <= hi && !covers(mark = capsule, x = lo, y = y))
            if (lo > hi) return
        }

        if (covers(mark = capsule, x = hi, y = y)) {
            while (hi < width - 1 && covers(mark = capsule, x = hi + 1, y = y)) hi++
        } else {
            do hi-- while (!covers(mark = capsule, x = hi, y = y))
        }

        fill(y = y, from = lo, to = hi, argb = argb)
    }

    private fun paintArea(area: Area, argb: Int) {
        val points = area.points
        val nums = LongArray(points.size)
        val dens = LongArray(points.size)
        val top = points.minOf { it.y }.coerceAtLeast(0)
        val bottom = (points.maxOf { it.y } - 1).coerceAtMost(height - 1)

        for (y in top..bottom) {
            val cy = 2L * y + 1

            // Crossings with the row's centre line at num / den in doubled units, den > 0, insertion-sorted.
            var count = 0
            for (i in points.indices) {
                val p = points[i]
                val q = points[(i + 1) % points.size]
                val py = 2L * p.y
                val qy = 2L * q.y
                if ((py < cy) == (qy < cy)) continue

                val sign = if (qy > py) 1L else -1L
                val den = (qy - py) * sign
                val num = (2L * p.x * (qy - py) + (cy - py) * 2L * (q.x - p.x)) * sign
                var j = count++
                while (j > 0 && nums[j - 1] * den > num * dens[j - 1]) {
                    nums[j] = nums[j - 1]
                    dens[j] = dens[j - 1]
                    j--
                }
                nums[j] = num
                dens[j] = den
            }

            // Even-odd as in covers: centre 2x + 1 is inside within [first, second) of a pair,
            // so x runs from ⌈(first − 1) / 2⌉ until ⌈(second − 1) / 2⌉.
            for (k in 0 until count step 2) {
                val from = Math.ceilDiv(nums[k] - dens[k], 2 * dens[k])
                val until = Math.ceilDiv(nums[k + 1] - dens[k + 1], 2 * dens[k + 1])
                val first = from.coerceAtLeast(0L).toInt()
                val last = (until - 1).coerceAtMost(width - 1L).toInt()
                fill(y = y, from = first, to = last, argb = argb)
            }
        }
    }

    private fun fill(y: Int, from: Int, to: Int, argb: Int) {
        if (from <= to) pixels.fill(element = argb, fromIndex = y * width + from, toIndex = y * width + to + 1)
    }
}
