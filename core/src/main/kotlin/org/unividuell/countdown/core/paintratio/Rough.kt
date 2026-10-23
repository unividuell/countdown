// Ported from roughjs 4.6.6 (https://github.com/pshihn/rough), MIT License, Copyright (c) 2019 Preet Shihn,
// and from its scan line, hachure-fill 0.5.2, MIT License, Copyright (c) 2023 Preet Shihn.
package org.unividuell.countdown.core.paintratio

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

enum class FillStyle { HACHURE, CROSS_HATCH, ZIGZAG, DOTS }

data class Vec(val x: Double, val y: Double)

/** A rough shape as marks, painted in two colours: the outline and the fill. */
data class Sketch(val outline: List<Mark>, val fill: List<Mark>)

/** A roughjs path op in the original's pixels: [Move] starts a subpath, [CurveTo] extends it by a cubic. */
internal sealed interface Op {
    data class Move(val to: Vec) : Op

    data class CurveTo(val c1: Vec, val c2: Vec, val to: Vec) : Op
}

/** What roughjs's generator hands its canvas: the outline's ops and the fill's. */
internal class Drawable(val outline: List<Op>, val fill: List<Op>)

/**
 * Draws shapes as roughjs draws them on the original's 300 × 225 canvas, with its default options and the
 * original's `fillWeight: 4`. The rough look is the game: the fill leaves fine, irregular slivers, which
 * makes the painted share hard to estimate.
 *
 * ```
 *  units ── ÷ SCALE ──► roughjs, in the original's pixels ──► ops ── × SCALE, flattened ──► marks
 *
 *  ellipse   rx, ry ±5 %; two passes of a Catmull-Rom curve through points jittered ±1 / ±1.5 px
 *  polygon   every edge twice (_doubleLine)
 *  line      twice: a bowed cubic, its ends and control points jittered up to 2 px
 *  fill      scan lines 4 px apart at −41° through the outline's points, each line twice and 4 px wide;
 *            cross-hatch adds +49°, zigzag splits each line into a thin V, dots are 4 px rough circles
 *  stroke    capsules along the curve, each open end cut square (canvas lineCap butt)
 * ```
 *
 * Every `random()` of roughjs is one draw from [random], so a seed redraws the same sketch. Trigonometry is
 * `StrictMath`: a round redraws its artwork later and has to count the same cells on whichever JVM it runs.
 */
class Rough(private val random: SeededRandom) {

    fun ellipse(center: Vec, width: Double, height: Double, fill: FillStyle?): Sketch =
        sketch(ellipses(center = center, sizes = listOf(width to height), fill = fill))

    /** An ellipse with a hole [hole] times its size around the same centre: two outlines, one fill even-odd. */
    fun ring(center: Vec, width: Double, height: Double, hole: Double, fill: FillStyle?): Sketch =
        sketch(ellipses(center = center, sizes = listOf(width to height, width * hole to height * hole), fill = fill))

    /** Several contours combine even-odd: a polygon inside a polygon is a ring. */
    fun shape(contours: List<List<Vec>>, fill: FillStyle?): Sketch {
        require(contours.isNotEmpty()) { "a shape needs at least one contour" }
        return sketch(polygons(contours = contours, fill = fill))
    }

    /** roughjs's `line`, [radius] units either side. */
    fun line(from: Vec, to: Vec, radius: Int): List<Mark> = marks(ops = lineOps(from = from, to = to), radius = radius)

    /** `generator.ellipse` for each of [sizes] (width to height, units); the fill hatches their points together. */
    internal fun ellipses(center: Vec, sizes: List<Pair<Double, Double>>, fill: FillStyle?): Drawable {
        val drawn = sizes.map { (width, height) ->
            val params = generateEllipseParams(width = width / SCALE, height = height / SCALE)
            ellipseWithParams(x = center.x / SCALE, y = center.y / SCALE, params = params)
        }
        val fillOps = fill?.let { patternFillPolygons(polygons = drawn.map { it.estimatedPoints }, style = it) }
        return Drawable(outline = drawn.flatMap { it.ops }, fill = fillOps.orEmpty())
    }

    /** `generator.polygon` for each contour (units); the fill hatches them together. */
    internal fun polygons(contours: List<List<Vec>>, fill: FillStyle?): Drawable {
        val polygons = contours.map { contour -> contour.map { Vec(x = it.x / SCALE, y = it.y / SCALE) } }
        val outline = polygons.flatMap { linearPath(points = it, close = true) }
        val fillOps = fill?.let { patternFillPolygons(polygons = polygons, style = it) }
        return Drawable(outline = outline, fill = fillOps.orEmpty())
    }

    internal fun lineOps(from: Vec, to: Vec): List<Op> = doubleLine(
        from = Vec(x = from.x / SCALE, y = from.y / SCALE),
        to = Vec(x = to.x / SCALE, y = to.y / SCALE),
    )

    private fun sketch(drawable: Drawable) = Sketch(
        outline = marks(ops = drawable.outline, radius = OUTLINE_RADIUS),
        fill = marks(ops = drawable.fill, radius = FILL_RADIUS),
    )

    /** `_offset`: uniform in `min..max`, scaled by roughness and [gain]. */
    private fun offset(min: Double, max: Double, gain: Double = 1.0): Double =
        ROUGHNESS * gain * (random.nextDouble() * (max - min) + min)

    /** `_offsetOpt`: uniform in `−x..x`. */
    private fun offsetOpt(x: Double, gain: Double = 1.0): Double = offset(min = -x, max = x, gain = gain)

    /** `linearPath`: every edge a [doubleLine], the closing one last. */
    private fun linearPath(points: List<Vec>, close: Boolean): List<Op> = when {
        points.size > 2 -> buildList {
            for (i in 0 until points.size - 1) addAll(doubleLine(from = points[i], to = points[i + 1]))
            if (close) addAll(doubleLine(from = points.last(), to = points.first()))
        }
        points.size == 2 -> doubleLine(from = points[0], to = points[1])
        else -> emptyList()
    }

    /** `_doubleLine`: the line twice, the second with half the jitter (multi-stroke is on for outline and fill). */
    private fun doubleLine(from: Vec, to: Vec): List<Op> =
        line(from = from, to = to, overlay = false) + line(from = from, to = to, overlay = true)

    /** `_line`: a cubic from near [from] to near [to], bowed sideways; lines over 200 px jitter less. */
    private fun line(from: Vec, to: Vec, overlay: Boolean): List<Op> {
        val (x1, y1) = from
        val (x2, y2) = to
        val lengthSq = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2)
        val length = sqrt(lengthSq)
        val gain = when {
            length < 200 -> 1.0
            length > 500 -> 0.4
            else -> -0.0016668 * length + 1.233334
        }

        // A line under 20 px jitters by a tenth of its length at most.
        var offset = MAX_RANDOMNESS_OFFSET
        if (offset * offset * 100 > lengthSq) offset = length / 10
        val jitter = if (overlay) offset / 2 else offset

        val divergePoint = 0.2 + random.nextDouble() * 0.2
        val midDispX = offsetOpt(x = BOWING * MAX_RANDOMNESS_OFFSET * (y2 - y1) / 200, gain = gain)
        val midDispY = offsetOpt(x = BOWING * MAX_RANDOMNESS_OFFSET * (x1 - x2) / 200, gain = gain)
        fun jittered() = offsetOpt(x = jitter, gain = gain)

        val move = Vec(x = x1 + jittered(), y = y1 + jittered())
        val c1 = Vec(
            x = midDispX + x1 + (x2 - x1) * divergePoint + jittered(),
            y = midDispY + y1 + (y2 - y1) * divergePoint + jittered(),
        )
        val c2 = Vec(
            x = midDispX + x1 + 2 * (x2 - x1) * divergePoint + jittered(),
            y = midDispY + y1 + 2 * (y2 - y1) * divergePoint + jittered(),
        )
        val end = Vec(x = x2 + jittered(), y = y2 + jittered())
        return listOf(Op.Move(move), Op.CurveTo(c1 = c1, c2 = c2, to = end))
    }

    /** `generateEllipseParams`: the step and the radii, each moved by up to 5 % (1 − curveFitting). */
    private fun generateEllipseParams(width: Double, height: Double): EllipseParams {
        val psq = sqrt(PI * 2 * sqrt(((width / 2) * (width / 2) + (height / 2) * (height / 2)) / 2))
        val stepCount = ceil(max(a = CURVE_STEP_COUNT, b = CURVE_STEP_COUNT / sqrt(200.0) * psq))
        val curveFitRandomness = 1 - CURVE_FITTING
        val rx = abs(width / 2)
        val ry = abs(height / 2)
        return EllipseParams(
            increment = PI * 2 / stepCount,
            rx = rx + offsetOpt(rx * curveFitRandomness),
            ry = ry + offsetOpt(ry * curveFitRandomness),
        )
    }

    /** `ellipseWithParams`: two passes; the first one's points are what the fill hatches. */
    private fun ellipseWithParams(x: Double, y: Double, params: EllipseParams): DrawnEllipse {
        val overlap = params.increment * offset(min = 0.1, max = offset(min = 0.4, max = 1.0))
        val (ap1, cp1) = computeEllipsePoints(params = params, cx = x, cy = y, offset = 1.0, overlap = overlap)
        val (ap2, _) = computeEllipsePoints(params = params, cx = x, cy = y, offset = 1.5, overlap = 0.0)
        return DrawnEllipse(estimatedPoints = cp1, ops = curve(ap1) + curve(ap2))
    }

    /**
     * `_computeEllipsePoints` at roughness ≠ 0: once around from a random start, every point moved by up to
     * [offset] per axis, then past the start and back in to 0.98 and 0.9 of the radius. Returns all points
     * and the core ones.
     */
    private fun computeEllipsePoints(
        params: EllipseParams,
        cx: Double,
        cy: Double,
        offset: Double,
        overlap: Double,
    ): Pair<List<Vec>, List<Vec>> {
        val (increment, rx, ry) = params
        fun at(share: Double, angle: Double) = Vec(
            x = offsetOpt(offset) + cx + share * rx * StrictMath.cos(angle),
            y = offsetOpt(offset) + cy + share * ry * StrictMath.sin(angle),
        )

        val core = mutableListOf<Vec>()
        val all = mutableListOf<Vec>()
        val radOffset = offsetOpt(0.5) - PI / 2
        all += at(share = 0.9, angle = radOffset - increment)

        val endAngle = PI * 2 + radOffset - 0.01
        var angle = radOffset
        while (angle < endAngle) {
            val p = at(share = 1.0, angle = angle)
            core += p
            all += p
            angle += increment
        }

        all += at(share = 1.0, angle = radOffset + PI * 2 + overlap * 0.5)
        all += at(share = 0.98, angle = radOffset + overlap)
        all += at(share = 0.9, angle = radOffset + overlap * 0.5)
        return all to core
    }

    /** `patternFillPolygons` with the filler of [style]. */
    private fun patternFillPolygons(polygons: List<List<Vec>>, style: FillStyle): List<Op> = when (style) {
        FillStyle.HACHURE -> renderLines(polygonHachureLines(polygons = polygons, hachureAngle = HACHURE_ANGLE))
        FillStyle.CROSS_HATCH ->
            renderLines(polygonHachureLines(polygons = polygons, hachureAngle = HACHURE_ANGLE)) +
                renderLines(polygonHachureLines(polygons = polygons, hachureAngle = HACHURE_ANGLE + 90))
        FillStyle.ZIGZAG -> zigzag(polygons)
        FillStyle.DOTS -> dots(polygons)
    }

    /** `polygonHachureLines`: in three of ten fills the scan line steps a whole gap at a time. */
    private fun polygonHachureLines(polygons: List<List<Vec>>, hachureAngle: Double): List<Line> {
        val gap = max(a = HACHURE_GAP, b = 0.1).roundToInt()
        var skipOffset = 1
        if (ROUGHNESS >= 1 && random.nextDouble() > 0.7) skipOffset = gap
        return hachureLines(polygons = polygons, gap = gap, angle = hachureAngle + 90, step = skipOffset)
    }

    /** `HachureFiller.renderLines`. */
    private fun renderLines(lines: List<Line>): List<Op> = lines.flatMap { doubleLine(from = it.a, to = it.b) }

    /** `ZigZagFiller`: each hachure line as a thin V, open by a gap across at its first end. */
    private fun zigzag(polygons: List<List<Vec>>): List<Op> {
        val gap = max(a = HACHURE_GAP, b = 0.1)
        val lines = polygonHachureLines(polygons = polygons, hachureAngle = HACHURE_ANGLE)
        val zigZagAngle = PI / 180 * HACHURE_ANGLE
        val dgx = gap * 0.5 * StrictMath.cos(zigZagAngle)
        val dgy = gap * 0.5 * StrictMath.sin(zigZagAngle)

        val zigzagLines = lines.filter { lineLength(it) > 0 }.flatMap { (p1, p2) ->
            listOf(
                Line(a = Vec(x = p1.x - dgx, y = p1.y + dgy), b = p2),
                Line(a = Vec(x = p1.x + dgx, y = p1.y - dgy), b = p2),
            )
        }
        return renderLines(zigzagLines)
    }

    /** `DotFiller`: vertical scan lines a gap apart; on each, every gap a rough circle of fillWeight, moved ±¼ gap. */
    private fun dots(polygons: List<List<Vec>>): List<Op> {
        val lines = polygonHachureLines(polygons = polygons, hachureAngle = 0.0)
        val gap = max(a = HACHURE_GAP, b = 0.1)
        val weight = FILL_WEIGHT.toDouble()
        val ro = gap / 4

        return buildList {
            for (line in lines) {
                val length = lineLength(line)
                val count = ceil(length / gap).toInt() - 1
                val offset = length - count * gap
                val x = (line.a.x + line.b.x) / 2 - gap / 4
                val minY = min(a = line.a.y, b = line.b.y)

                for (i in 0 until count) {
                    val y = minY + offset + i * gap
                    val cx = x - ro + random.nextDouble() * 2 * ro
                    val cy = y - ro + random.nextDouble() * 2 * ro
                    val params = generateEllipseParams(width = weight, height = weight)
                    addAll(ellipseWithParams(x = cx, y = cy, params = params).ops)
                }
            }
        }
    }

    companion object {
        /** Units per pixel of the original's 300 × 225 canvas. */
        const val SCALE = 4

        /** Half the canvas strokes' widths in units: strokeWidth 1 px for the outline, fillWeight 4 px for the fill. */
        const val OUTLINE_RADIUS = STROKE_WIDTH * SCALE / 2
        const val FILL_RADIUS = FILL_WEIGHT * SCALE / 2

        fun fillOf(random: SeededRandom): FillStyle = random.pick(FillStyle.entries)
    }
}

// roughjs's default options; fillWeight is the original's.
private const val MAX_RANDOMNESS_OFFSET = 2.0
private const val ROUGHNESS = 1.0
private const val BOWING = 1.0
private const val STROKE_WIDTH = 1
private const val CURVE_TIGHTNESS = 0.0
private const val CURVE_FITTING = 0.95
private const val CURVE_STEP_COUNT = 9.0
private const val HACHURE_ANGLE = -41.0
private const val HACHURE_GAP = 4.0 * STROKE_WIDTH
private const val FILL_WEIGHT = 4

/** Flattening keeps every piece within this many units of its cubic. */
private const val FLATNESS = 0.25

/** [covers] is exact for marks within ±10 000. */
private const val REACH = 10_000

private data class EllipseParams(val increment: Double, val rx: Double, val ry: Double)

private class DrawnEllipse(val estimatedPoints: List<Vec>, val ops: List<Op>)

private data class Line(val a: Vec, val b: Vec)

/** An edge of the scan line: its x moves along with the line, by islope per unit of y. */
private class Edge(val ymin: Double, val ymax: Double, var x: Double, val islope: Double)

/** `_curve` without a close point: a Catmull-Rom spline (tightness 0) from the second point to the last but one. */
private fun curve(points: List<Vec>): List<Op> {
    require(points.size > 3) { "an ellipse pass has more than 3 points, was ${points.size}" }
    val s = 1 - CURVE_TIGHTNESS

    return buildList {
        add(Op.Move(points[1]))
        var i = 1
        while (i + 2 < points.size) {
            val p = points[i]
            val c1 = Vec(
                x = p.x + (s * points[i + 1].x - s * points[i - 1].x) / 6,
                y = p.y + (s * points[i + 1].y - s * points[i - 1].y) / 6,
            )
            val c2 = Vec(
                x = points[i + 1].x + (s * points[i].x - s * points[i + 2].x) / 6,
                y = points[i + 1].y + (s * points[i].y - s * points[i + 2].y) / 6,
            )
            add(Op.CurveTo(c1 = c1, c2 = c2, to = points[i + 1]))
            i++
        }
    }
}

/** hachure-fill's `hachureLines`: turn the polygons by [angle] about the origin, scan, turn the lines back. */
private fun hachureLines(polygons: List<List<Vec>>, gap: Int, angle: Double, step: Int): List<Line> {
    if (angle == 0.0) return straightHachureLines(polygons = polygons, gap = gap, step = step)

    val turned = polygons.map { polygon -> polygon.map { rotated(p = it, degrees = angle) } }
    return straightHachureLines(polygons = turned, gap = gap, step = step)
        .map { Line(a = rotated(p = it.a, degrees = -angle), b = rotated(p = it.b, degrees = -angle)) }
}

/**
 * hachure-fill's `straightHachureLines`: a scan line from the top, one unit (or [step]) at a time; every
 * [gap]th row pairs the active edges' x, rounded, into lines — even-odd across all polygons.
 *
 * As in the original, an edge joins with the x of its upper end, however far below that the scan line is.
 */
private fun straightHachureLines(polygons: List<List<Vec>>, gap: Int, step: Int): List<Line> {
    val vertexArray = polygons.mapNotNull { polygon ->
        val first = polygon.first()
        val last = polygon.last()
        val vertices = if (first.x == last.x && first.y == last.y) polygon else polygon + Vec(x = first.x, y = first.y)
        vertices.takeIf { it.size > 2 }
    }

    val edges = mutableListOf<Edge>()
    for (vertices in vertexArray) {
        for (i in 0 until vertices.size - 1) {
            val p1 = vertices[i]
            val p2 = vertices[i + 1]
            if (p1.y != p2.y) {
                val ymin = min(a = p1.y, b = p2.y)
                edges += Edge(
                    ymin = ymin,
                    ymax = max(a = p1.y, b = p2.y),
                    x = if (ymin == p1.y) p1.x else p2.x,
                    islope = (p2.x - p1.x) / (p2.y - p1.y),
                )
            }
        }
    }
    edges.sortWith { e1, e2 ->
        when {
            e1.ymin < e2.ymin -> -1
            e1.ymin > e2.ymin -> 1
            e1.x < e2.x -> -1
            e1.x > e2.x -> 1
            e1.ymax == e2.ymax -> 0
            e1.ymax < e2.ymax -> -1
            else -> 1
        }
    }

    val lines = mutableListOf<Line>()
    if (edges.isEmpty()) return lines

    val active = mutableListOf<Edge>()
    var y = edges[0].ymin
    var iteration = 0
    while (active.isNotEmpty() || edges.isNotEmpty()) {
        if (edges.isNotEmpty()) {
            var ix = -1
            for (i in edges.indices) {
                if (edges[i].ymin > y) break
                ix = i
            }
            val joining = edges.subList(fromIndex = 0, toIndex = ix + 1)
            active += joining
            joining.clear()
        }

        active.removeAll { it.ymax <= y }
        active.sortWith { a, b -> if (a.x == b.x) 0 else if (a.x < b.x) -1 else 1 }

        if ((step != 1 || iteration % gap == 0) && active.size > 1) {
            for (i in 0 until active.size - 1 step 2) {
                lines += Line(a = Vec(x = jsRound(active[i].x), y = y), b = Vec(x = jsRound(active[i + 1].x), y = y))
            }
        }

        y += step
        for (edge in active) edge.x = edge.x + step * edge.islope
        iteration++
    }
    return lines
}

/** hachure-fill's `rotatePoints` about the origin. */
private fun rotated(p: Vec, degrees: Double): Vec {
    val angle = PI / 180 * degrees
    val cos = StrictMath.cos(angle)
    val sin = StrictMath.sin(angle)
    return Vec(x = p.x * cos - p.y * sin, y = p.x * sin + p.y * cos)
}

/** JavaScript's `Math.round`: halves up. */
private fun jsRound(x: Double): Double = Math.round(x).toDouble()

private fun lineLength(line: Line): Double = distance(a = line.a, b = line.b)

/** The canvas's stroke of [ops]: each subpath flattened and scaled to units, [radius] either side. */
internal fun marks(ops: List<Op>, radius: Int): List<Mark> {
    val marks = mutableListOf<Mark>()
    var polyline = mutableListOf<Vec>()

    for (op in ops) {
        when (op) {
            is Op.Move -> {
                marks += stroke(polyline = polyline, radius = radius)
                polyline = mutableListOf(op.to.scaled())
            }
            is Op.CurveTo -> polyline += flattened(
                p0 = polyline.last(), c1 = op.c1.scaled(), c2 = op.c2.scaled(), p3 = op.to.scaled(),
            )
        }
    }
    marks += stroke(polyline = polyline, radius = radius)
    return marks
}

/**
 * A cubic as points from just after [p0] to [p3]: |B''| ≤ 6·m, so n even pieces stray at most ¾·m / n² from it.
 */
private fun flattened(p0: Vec, c1: Vec, c2: Vec, p3: Vec): List<Vec> {
    val m = max(
        a = hypot(x = p0.x - 2 * c1.x + c2.x, y = p0.y - 2 * c1.y + c2.y),
        b = hypot(x = c1.x - 2 * c2.x + p3.x, y = c1.y - 2 * c2.y + p3.y),
    )
    val n = max(a = 1, b = ceil(sqrt(0.75 * m / FLATNESS)).toInt())

    return (1..n).map { k ->
        val t = k.toDouble() / n
        val u = 1 - t
        Vec(
            x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
            y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
        )
    }
}

/**
 * A canvas stroke along [polyline] (units), [radius] either side. Capsules join its pieces round; each open
 * end is cut square (lineCap butt) by a rectangle over its last [radius] units instead of a capsule's cap.
 *
 * ```
 *  ┌──┬─────────────────┬──┐
 *  │▒▒(  capsules ...    )▒▒│   ▒ butt rectangle: start → start + radius, end − radius → end
 *  └──┴─────────────────┴──┘
 * ```
 */
internal fun stroke(polyline: List<Vec>, radius: Int): List<Mark> {
    val length = polyline.zipWithNext { a, b -> distance(a = a, b = b) }.sum()
    if (length == 0.0) return emptyList()
    if (length <= 2 * radius) return listOfNotNull(butt(from = polyline.first(), to = polyline.last(), radius = radius))

    val (start, afterStart) = along(polyline = polyline, distance = radius.toDouble())
    val (end, afterEnd) = along(polyline = polyline, distance = length - radius)
    val inner = listOf(start) + polyline.subList(fromIndex = afterStart, toIndex = afterEnd) + end

    return capsules(polyline = inner, radius = radius) + listOfNotNull(
        butt(from = polyline.first(), to = start, radius = radius),
        butt(from = end, to = polyline.last(), radius = radius),
    )
}

/** The point [distance] units along [polyline], and the index of the first vertex after it. */
private fun along(polyline: List<Vec>, distance: Double): Pair<Vec, Int> {
    var walked = 0.0
    for (i in 0 until polyline.size - 1) {
        val a = polyline[i]
        val b = polyline[i + 1]
        val piece = distance(a = a, b = b)
        if (piece > 0 && walked + piece >= distance) {
            val t = (distance - walked) / piece
            return Vec(x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t) to i + 1
        }
        walked += piece
    }
    return polyline.last() to polyline.size - 1
}

/**
 * The rectangle from [from] to [to], [radius] either side, on integer corners: both ends move by the same
 * rounded offset, so it is a parallelogram and never crosses itself. `null` where the ends round together.
 */
private fun butt(from: Vec, to: Vec, radius: Int): Area? {
    val a = from.point()
    val b = to.point()
    val length = hypot(x = (b.x - a.x).toDouble(), y = (b.y - a.y).toDouble())
    if (length == 0.0) return null

    val dx = (-(b.y - a.y) / length * radius).roundToInt()
    val dy = ((b.x - a.x) / length * radius).roundToInt()
    return Area(
        listOf(
            corner(x = a.x + dx, y = a.y + dy),
            corner(x = b.x + dx, y = b.y + dy),
            corner(x = b.x - dx, y = b.y - dy),
            corner(x = a.x - dx, y = a.y - dy),
        ),
    )
}

/** Rounds a polyline onto the grid and joins its points; one that rounds to a single point is a dot. */
private fun capsules(polyline: List<Vec>, radius: Int): List<Mark> {
    val rounded = polyline.map { it.point() }
    val points = rounded.filterIndexed { i, p -> i == 0 || p != rounded[i - 1] }
    if (points.size == 1) {
        return listOf(Capsule(ax = points[0].x, ay = points[0].y, bx = points[0].x, by = points[0].y, radius = radius))
    }
    return points.zipWithNext { a, b -> Capsule(ax = a.x, ay = a.y, bx = b.x, by = b.y, radius = radius) }
}

private fun Vec.scaled() = Vec(x = x * Rough.SCALE, y = y * Rough.SCALE)

private fun Vec.point(): Point {
    require(abs(x) <= REACH && abs(y) <= REACH) { "($x, $y) lies beyond ±$REACH" }
    return Point(x = x.roundToInt(), y = y.roundToInt())
}

private fun corner(x: Int, y: Int): Point {
    require(abs(x) <= REACH && abs(y) <= REACH) { "($x, $y) lies beyond ±$REACH" }
    return Point(x = x, y = y)
}

private fun hypot(x: Double, y: Double): Double = sqrt(x * x + y * y)

private fun distance(a: Vec, b: Vec): Double = hypot(x = b.x - a.x, y = b.y - a.y)
