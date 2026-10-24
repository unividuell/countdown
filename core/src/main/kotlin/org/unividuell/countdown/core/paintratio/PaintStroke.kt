package org.unividuell.countdown.core.paintratio

/**
 * One brush stroke as the client sends it: `brush` indexes the round's brush diameters, `points` is
 * flat `[x0, y0, x1, y1, …]`. Only functions beyond that, so Jackson writes exactly these three fields.
 */
data class PaintStroke(val brush: Int, val color: String, val points: List<Int>) {

    /** A single point is a dot; otherwise one capsule per pair of consecutive points. */
    fun marks(brushes: List<Int>): List<Capsule> {
        val radius = brushes[brush] / 2
        if (points.size == 2) {
            return listOf(Capsule(ax = points[0], ay = points[1], bx = points[0], by = points[1], radius = radius))
        }
        return (0 until points.size - 2 step 2).map { i ->
            Capsule(ax = points[i], ay = points[i + 1], bx = points[i + 2], by = points[i + 3], radius = radius)
        }
    }

    /** `#3049e8` → `0xFF3049E8`. */
    fun argb(): Int = color.substring(1).toInt(radix = 16) or OPAQUE
}

private const val OPAQUE = 0xFF000000.toInt()

fun Raster.paint(strokes: List<PaintStroke>, brushes: List<Int>) {
    for (stroke in strokes) {
        val argb = stroke.argb()
        for (mark in stroke.marks(brushes)) paint(mark = mark, argb = argb)
    }
}
