package org.unividuell.countdown.core.paintratio

data class Point(val x: Int, val y: Int)

/** Something painted onto the canvas; [covers] decides which cells it paints. */
sealed interface Mark

/** A stroke piece from `a` to `b`, `radius` around it. `a == b` is a dot. */
data class Capsule(val ax: Int, val ay: Int, val bx: Int, val by: Int, val radius: Int) : Mark {
    init {
        require(radius >= 0) { "radius must not be negative, was $radius" }
    }
}

/** A polygon filled by the even-odd rule; it may intersect itself. */
data class Area(val points: List<Point>) : Mark {
    init {
        require(points.size >= 3) { "an area needs at least 3 points, was ${points.size}" }
    }
}

/**
 * The counting rule: cell `(x, y)` is painted when its centre `(x + ½, y + ½)` lies within [mark].
 *
 * Exact: coordinates are doubled so every centre is an integer, and all arithmetic is `Long` —
 * no root, no rounding. The products stay below 2⁶³ for marks within the guess limit of ±10 000
 * on a canvas of [PaintCanvas]' size.
 */
fun covers(mark: Mark, x: Int, y: Int): Boolean = when (mark) {
    is Capsule -> mark.coversCentre(cx = 2L * x + 1, cy = 2L * y + 1)
    is Area -> mark.enclosesCentre(cx = 2L * x + 1, cy = 2L * y + 1)
}

/** Distance from the centre to the segment `ab`, compared squared: projection first, then the cross product. */
private fun Capsule.coversCentre(cx: Long, cy: Long): Boolean {
    val dx = 2L * (bx - ax)
    val dy = 2L * (by - ay)
    val wx = cx - 2L * ax
    val wy = cy - 2L * ay
    val r2 = 4L * radius * radius
    val t = wx * dx + wy * dy
    val len2 = dx * dx + dy * dy

    return when {
        len2 == 0L || t <= 0L -> wx * wx + wy * wy <= r2
        t >= len2 -> (cx - 2L * bx).let { it * it } + (cy - 2L * by).let { it * it } <= r2
        else -> (wx * dy - wy * dx).let { it * it } <= r2 * len2
    }
}

/**
 * Even-odd along a ray to the right of the centre. A vertex never lies on the ray (centres are odd,
 * vertices even); a crossing exactly at the centre is not strictly right of it and does not count.
 */
private fun Area.enclosesCentre(cx: Long, cy: Long): Boolean {
    var inside = false
    for (i in points.indices) {
        val p = points[i]
        val q = points[(i + 1) % points.size]
        val py = 2L * p.y - cy
        val qy = 2L * q.y - cy
        if ((py < 0) == (qy < 0)) continue

        // The crossing lies at (px·qy − py·qx) / (qy − py) relative to the centre.
        val num = (2L * p.x - cx) * qy - py * (2L * q.x - cx)
        val den = qy - py
        if (if (den > 0) num > 0 else num < 0) inside = !inside
    }
    return inside
}
