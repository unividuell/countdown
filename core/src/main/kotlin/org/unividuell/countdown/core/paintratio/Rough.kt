// After roughjs (https://roughjs.com, MIT, Preet Shihn): the procedure, not its code or its random sequence.
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

/** How a shape is filled; `gap` is the distance between its lines or dots. */
data class Fill(val style: FillStyle, val gap: Int) {
    init {
        require(gap > 0) { "gap must be positive, was $gap" }
    }
}

data class Vec(val x: Double, val y: Double)

/** A rough shape as marks, painted in two colours: the outline and the fill. */
data class Sketch(val outline: List<Mark>, val fill: List<Mark>)

/**
 * Draws shapes as a hand would. The rough look is the game: gaps in the hatching, an outline that does
 * not close, lines fraying past it — all of that makes the painted share hard to estimate.
 *
 * ```
 * outline  support points about every 40 units, each moved radially; a Catmull-Rom curve
 *          through them, twice, each pass once around from a random point and one point on
 * fill     the plain contours as polygons (even-odd), hatched at −41°: every line
 *          frays past them by −4..+12 units at both ends and bows by up to 1 % of its length
 * ```
 *
 * Every draw comes from [random], so a seed redraws the same sketch. Trigonometry is `StrictMath`:
 * a round redraws its artwork later and has to count the same cells on whichever JVM it runs.
 */
class Rough(private val random: SeededRandom) {

    fun ellipse(center: Vec, width: Double, height: Double, fill: Fill?): Sketch =
        sketch(contours = listOf(ellipseContour(center = center, width = width, height = height)), fill = fill)

    /** Several contours combine even-odd: an ellipse inside an ellipse is a ring. */
    fun shape(contours: List<List<Vec>>, fill: Fill?): Sketch {
        require(contours.isNotEmpty()) { "a shape needs at least one contour" }
        return sketch(contours = contours.map(::subdivide), fill = fill)
    }

    /** A bowed, slightly trembling line, drawn twice. */
    fun line(from: Vec, to: Vec, radius: Int): List<Mark> = List(2) {
        val bow = spread(BOW_SHARE * distance(a = from, b = to))
        capsules(polyline = bowed(from = from, to = to, bow = bow, tremble = MIN_JITTER), radius = radius)
    }.flatten()

    private fun sketch(contours: List<List<Vec>>, fill: Fill?): Sketch {
        val outline = contours.flatMap { contour -> pass(contour) + pass(contour) }
        val marks = when (fill?.style) {
            null -> emptyList()
            FillStyle.HACHURE -> hachure(contours = contours, gap = fill.gap, degrees = HACHURE_ANGLE_DEG)
                .flatMap { it.marks }
            FillStyle.CROSS_HATCH -> listOf(HACHURE_ANGLE_DEG, HACHURE_ANGLE_DEG + 90).flatMap { degrees ->
                hachure(contours = contours, gap = fill.gap, degrees = degrees).flatMap { it.marks }
            }
            FillStyle.ZIGZAG -> zigzag(hachure(contours = contours, gap = fill.gap, degrees = HACHURE_ANGLE_DEG))
            FillStyle.DOTS -> dots(contours = contours, gap = fill.gap, degrees = HACHURE_ANGLE_DEG)
        }
        return Sketch(outline = outline, fill = marks)
    }

    /** Once around [contour] from a random support point and one point past it, every point freshly moved. */
    private fun pass(contour: List<Vec>): List<Mark> {
        val n = contour.size
        val centre = Vec(x = contour.sumOf { it.x } / n, y = contour.sumOf { it.y } / n)
        val start = random.nextInt(n)

        // Catmull-Rom needs one more point on each side than it passes through.
        val controls = (start - 1..start + n + OVERRUN + 1).map { i ->
            moved(point = contour[i.mod(n)], centre = centre)
        }
        val curve = buildList {
            for (k in 1 until controls.size - 2) {
                val (p0, p1, p2, p3) = controls.subList(fromIndex = k - 1, toIndex = k + 3)
                val steps = max(a = 1, b = ceil(distance(a = p1, b = p2) / OUTLINE_PIECE).toInt())
                for (s in 0 until steps) add(catmullRom(p0 = p0, p1 = p1, p2 = p2, p3 = p3, t = s.toDouble() / steps))
            }
            add(controls[controls.size - 2])
        }
        return capsules(polyline = curve, radius = OUTLINE_RADIUS)
    }

    /** Towards or away from [centre] by up to 3 % of the distance, at least 4 units. */
    private fun moved(point: Vec, centre: Vec): Vec {
        val radius = distance(a = point, b = centre)
        if (radius == 0.0) return point
        val scale = 1 + spread(max(a = JITTER_SHARE * radius, b = MIN_JITTER)) / radius
        return Vec(x = centre.x + (point.x - centre.x) * scale, y = centre.y + (point.y - centre.y) * scale)
    }

    /**
     * Parallel lines at [degrees], [gap] apart, cut by the contours even-odd. The contours are turned so the
     * lines run along x; each row's crossings pair up into lines, which are then frayed and bowed.
     */
    private fun hachure(contours: List<List<Vec>>, gap: Int, degrees: Double): List<Hatch> {
        val frame = Frame(degrees)
        val turned = contours.map { contour -> contour.map(frame::fromCanvas) }
        val top = turned.minOf { contour -> contour.minOf { it.y } }
        val bottom = turned.maxOf { contour -> contour.maxOf { it.y } }

        val hatches = mutableListOf<Hatch>()
        var row = 0
        while (top + gap * (row + 0.5) < bottom) {
            val y = top + gap * (row + 0.5)
            val xs = crossings(contours = turned, y = y).sorted()
            for (k in 0 until xs.size step 2) {
                var from = xs[k] - fray()
                var to = xs[k + 1] + fray()
                // A sliver frayed shorter than nothing is a dot.
                if (from > to) {
                    from = (from + to) / 2
                    to = from
                }

                val start = frame.toCanvas(Vec(x = from, y = y))
                val end = frame.toCanvas(Vec(x = to, y = y))
                val line = bowed(from = start, to = end, bow = spread(BOW_SHARE * (to - from)), tremble = 0.0)
                val marks = capsules(polyline = line, radius = FILL_RADIUS)
                hatches += Hatch(row = row, left = xs[k], right = xs[k + 1], start = start, end = end, marks = marks)
            }
            row++
        }
        return hatches
    }

    /**
     * Joins the hatches into runs, alternately at their right and left ends. Only hatches on neighbouring rows
     * that overlap one to one join: where rows split or merge a hole or a notch begins, and a joint would cross it.
     */
    private fun zigzag(hatches: List<Hatch>): List<Mark> {
        val rows = hatches.groupBy { it.row }
        fun overlapping(hatch: Hatch, row: Int) =
            rows[row].orEmpty().filter { it.left < hatch.right && hatch.left < it.right }

        val next = hatches.associateWith { hatch ->
            overlapping(hatch = hatch, row = hatch.row + 1).singleOrNull()
                ?.takeIf { below -> overlapping(hatch = below, row = hatch.row).size == 1 }
        }
        val heads = hatches - next.values.filterNotNull().toSet()

        val joints = mutableListOf<Mark>()
        for (head in heads) {
            var hatch = head
            var right = true
            while (true) {
                val following = next[hatch] ?: break
                val joint = if (right) listOf(hatch.end, following.end) else listOf(hatch.start, following.start)
                joints += capsules(polyline = joint, radius = FILL_RADIUS)
                right = !right
                hatch = following
            }
        }
        return hatches.flatMap { it.marks } + joints
    }

    /** Dots on a grid [gap] apart, turned to [degrees], each moved by up to a quarter gap; only those inside. */
    private fun dots(contours: List<List<Vec>>, gap: Int, degrees: Double): List<Mark> {
        val frame = Frame(degrees)
        val turned = contours.map { contour -> contour.map(frame::fromCanvas) }
        val left = turned.minOf { contour -> contour.minOf { it.x } }
        val right = turned.maxOf { contour -> contour.maxOf { it.x } }
        val top = turned.minOf { contour -> contour.minOf { it.y } }
        val bottom = turned.maxOf { contour -> contour.maxOf { it.y } }

        val dots = mutableListOf<Mark>()
        var row = 0
        while (top + gap * (row + 0.5) < bottom) {
            var column = 0
            while (left + gap * (column + 0.5) < right) {
                val dot = Vec(
                    x = left + gap * (column + 0.5) + spread(gap / 4.0),
                    y = top + gap * (row + 0.5) + spread(gap / 4.0),
                )
                if (crossings(contours = turned, y = dot.y).count { it > dot.x } % 2 == 1) {
                    dots += capsules(polyline = listOf(frame.toCanvas(dot)), radius = FILL_RADIUS)
                }
                column++
            }
            row++
        }
        return dots
    }

    /** From [from] to [to] in pieces of about 40 units, bulging by [bow] in the middle, each point trembling across. */
    private fun bowed(from: Vec, to: Vec, bow: Double, tremble: Double): List<Vec> {
        val length = distance(a = from, b = to)
        val pieces = max(a = 1, b = ceil(length / LINE_PIECE).toInt())

        // The unit normal; the bulge is a parabola, 0 at both ends and [bow] in the middle.
        val nx = if (length == 0.0) 0.0 else (from.y - to.y) / length
        val ny = if (length == 0.0) 0.0 else (to.x - from.x) / length
        return (0..pieces).map { k ->
            val t = k.toDouble() / pieces
            val across = 4 * t * (1 - t) * bow + if (tremble > 0) spread(tremble) else 0.0
            Vec(x = from.x + (to.x - from.x) * t + nx * across, y = from.y + (to.y - from.y) * t + ny * across)
        }
    }

    /** Uniform in `−bound..bound`. */
    private fun spread(bound: Double): Double = (2 * random.nextDouble() - 1) * bound

    private fun fray(): Double = FRAY_MIN + (FRAY_MAX - FRAY_MIN) * random.nextDouble()

    companion object {
        const val OUTLINE_RADIUS = 2
        const val FILL_RADIUS = 8
        const val HACHURE_ANGLE_DEG = -41.0
        val GAPS = 16..64

        fun fillOf(random: SeededRandom): Fill = Fill(
            style = random.pick(FillStyle.entries),
            gap = random.nextIntBetween(min = GAPS.first, maxInclusive = GAPS.last),
        )
    }
}

private const val SUPPORT_SPACING = 40.0
private const val MIN_SUPPORTS = 12
private const val JITTER_SHARE = 0.03
private const val MIN_JITTER = 4.0
private const val OVERRUN = 1
private const val OUTLINE_PIECE = 4.0
private const val LINE_PIECE = 40.0
private const val FRAY_MIN = -4.0
private const val FRAY_MAX = 12.0
private const val BOW_SHARE = 0.01

/** [covers] is exact for marks within ±10 000. */
private const val REACH = 10_000

/** A fill line: its row and span in the turned frame, its frayed ends and marks on the canvas. */
private class Hatch(
    val row: Int,
    val left: Double,
    val right: Double,
    val start: Vec,
    val end: Vec,
    val marks: List<Mark>,
)

/** A frame turned by [degrees], so that its x axis runs along the fill lines. */
private class Frame(degrees: Double) {
    private val cos = StrictMath.cos(Math.toRadians(degrees))
    private val sin = StrictMath.sin(Math.toRadians(degrees))

    fun toCanvas(v: Vec) = Vec(x = v.x * cos - v.y * sin, y = v.x * sin + v.y * cos)

    fun fromCanvas(v: Vec) = Vec(x = v.x * cos + v.y * sin, y = -v.x * sin + v.y * cos)
}

/** Support points about every 40 units of circumference (Ramanujan's approximation), at least 12. */
internal fun ellipseContour(center: Vec, width: Double, height: Double): List<Vec> {
    val a = width / 2
    val b = height / 2
    val h = ((a - b) / (a + b)).let { it * it }
    val circumference = PI * (a + b) * (1 + 3 * h / (10 + sqrt(4 - 3 * h)))
    val n = max(a = MIN_SUPPORTS, b = (circumference / SUPPORT_SPACING).roundToInt())
    return List(n) { i ->
        val angle = 2 * PI * i / n
        Vec(x = center.x + a * StrictMath.cos(angle), y = center.y + b * StrictMath.sin(angle))
    }
}

/** Adds support points on long edges, about every 40 units and at least 12 in all; the corners stay. */
private fun subdivide(contour: List<Vec>): List<Vec> {
    require(contour.size >= 3) { "a contour needs at least 3 points, was ${contour.size}" }
    val edges = contour.indices.map { i -> contour[i] to contour[(i + 1) % contour.size] }
    val spacing = min(a = SUPPORT_SPACING, b = edges.sumOf { (p, q) -> distance(a = p, b = q) } / MIN_SUPPORTS)
    return edges.flatMap { (p, q) ->
        val pieces = max(a = 1, b = ceil(distance(a = p, b = q) / spacing).toInt())
        List(pieces) { k ->
            val t = k.toDouble() / pieces
            Vec(x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t)
        }
    }
}

/** Where the edges cross the horizontal at [y]; half-open, so a vertex on it counts once. */
private fun crossings(contours: List<List<Vec>>, y: Double): List<Double> = buildList {
    for (contour in contours) {
        for (i in contour.indices) {
            val p = contour[i]
            val q = contour[(i + 1) % contour.size]
            if ((p.y < y) != (q.y < y)) add(p.x + (y - p.y) / (q.y - p.y) * (q.x - p.x))
        }
    }
}

private fun catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: Double): Vec {
    fun axis(a: Double, b: Double, c: Double, d: Double) =
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
    return Vec(x = axis(a = p0.x, b = p1.x, c = p2.x, d = p3.x), y = axis(a = p0.y, b = p1.y, c = p2.y, d = p3.y))
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

private fun Vec.point(): Point {
    require(abs(x) <= REACH && abs(y) <= REACH) { "($x, $y) lies beyond ±$REACH" }
    return Point(x = x.roundToInt(), y = y.roundToInt())
}

private fun distance(a: Vec, b: Vec): Double = sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
