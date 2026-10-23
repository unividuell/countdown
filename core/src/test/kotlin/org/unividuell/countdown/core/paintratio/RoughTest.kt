package org.unividuell.countdown.core.paintratio

import io.kotest.assertions.withClue
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.doubles.shouldBeLessThan
import io.kotest.matchers.doubles.shouldBeLessThanOrEqual
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

class RoughTest {

    private val black = 0xFF000000.toInt()
    private val centre = Vec(x = PaintCanvas.WIDTH / 2.0, y = PaintCanvas.HEIGHT / 2.0)
    private val scale = Rough.SCALE.toDouble()

    private fun rough(seed: Int) = Rough(SeededRandom.fromSeed(seed))

    private fun raster(marks: List<Mark>) = Raster(width = PaintCanvas.WIDTH, height = PaintCanvas.HEIGHT)
        .also { raster -> marks.forEach { raster.paint(mark = it, argb = black) } }

    private fun Raster.painted(): List<Point> = buildList {
        for (y in 0 until height) for (x in 0 until width) if (isPainted(x = x, y = y)) add(Point(x = x, y = y))
    }

    /** Cells of the canvas, painted ones only on a [raster], whose centre lies within the ellipse [a] × [b]. */
    private fun cellsWithin(a: Double, b: Double, raster: Raster? = null): Int =
        (0 until PaintCanvas.HEIGHT).sumOf { y ->
            (0 until PaintCanvas.WIDTH).count { x ->
                raster?.isPainted(x = x, y = y) != false && rho(p = Point(x = x, y = y), a = a, b = b) <= 1
            }
        }

    /** Cell [p]'s centre measured in the ellipse of semi-axes [a], [b] around the canvas centre: 1 on its edge. */
    private fun rho(p: Point, a: Double, b: Double): Double {
        val dx = (p.x + 0.5 - centre.x) / a
        val dy = (p.y + 0.5 - centre.y) / b
        return sqrt(dx * dx + dy * dy)
    }

    /** How far a displacement of [perAxis] on each axis and [anyWay] in any direction moves [rho] at most. */
    private fun slack(perAxis: Double, anyWay: Double, a: Double, b: Double) =
        perAxis * sqrt(1 / (a * a) + 1 / (b * b)) + anyWay / min(a, b)

    /** roughjs ops split into subpaths, each a move and what follows it. */
    private fun subpaths(ops: List<Op>): List<List<Op>> = buildList {
        for (op in ops) if (op is Op.Move) add(mutableListOf(op)) else (last() as MutableList<Op>).add(op)
    }

    private fun List<Op>.start() = (first() as Op.Move).to
    private fun List<Op>.end() = (last() as Op.CurveTo).to

    private fun near(a: Vec, b: Vec, perAxis: Double) = abs(a.x - b.x) <= perAxis && abs(a.y - b.y) <= perAxis

    /** Units to the original's pixels, where roughjs's ops live. */
    private fun pixels(v: Vec) = Vec(x = v.x / scale, y = v.y / scale)

    @Test
    fun `the same seed draws the same sketch`() {
        val star = List(10) { i ->
            val r = if (i % 2 == 0) 400.0 else 200.0
            Vec(x = centre.x + r * cos(PI * i / 5), y = centre.y + r * sin(PI * i / 5))
        }

        for (style in FillStyle.entries) {
            rough(5).ellipse(center = centre, width = 600.0, height = 400.0, fill = style) shouldBe
                rough(5).ellipse(center = centre, width = 600.0, height = 400.0, fill = style)
            rough(5).ring(center = centre, width = 600.0, height = 400.0, hole = 0.5, fill = style) shouldBe
                rough(5).ring(center = centre, width = 600.0, height = 400.0, hole = 0.5, fill = style)
            rough(5).shape(contours = listOf(star), fill = style) shouldBe
                rough(5).shape(contours = listOf(star), fill = style)
        }
        rough(5).line(from = Vec(x = -50.0, y = 100.0), to = Vec(x = 1250.0, y = 700.0), radius = 30) shouldBe
            rough(5).line(from = Vec(x = -50.0, y = 100.0), to = Vec(x = 1250.0, y = 700.0), radius = 30)
    }

    @Test
    fun `another seed draws another outline`() {
        rough(1).ellipse(center = centre, width = 600.0, height = 400.0, fill = null).outline shouldNotBe
            rough(2).ellipse(center = centre, width = 600.0, height = 400.0, fill = null).outline
    }

    @Test
    fun `an ellipse's outline is two different passes`() {
        val passes = subpaths(rough(1).ellipses(center = centre, sizes = listOf(600.0 to 400.0), fill = null).outline)

        passes.size shouldBe 2
        passes[0] shouldNotBe passes[1]
    }

    @Test
    fun `each polygon edge is drawn twice, differently, from near corner to near corner`() {
        val corners = listOf(Vec(x = 200.0, y = 200.0), Vec(x = 1000.0, y = 200.0), Vec(x = 1000.0, y = 700.0))
        val strokes = subpaths(rough(2).polygons(contours = listOf(corners), fill = null).outline)

        strokes.size shouldBe 6
        strokes.chunked(2).forEachIndexed { i, (first, second) ->
            val from = corners[i]
            val to = corners[(i + 1) % corners.size]

            first shouldNotBe second
            // An end moves by maxRandomnessOffset (2 px) times a gain of at most 1, per axis.
            for (stroke in listOf(first, second)) {
                withClue("edge $i") {
                    near(a = stroke.start(), b = pixels(from), perAxis = 2.0) shouldBe true
                    near(a = stroke.end(), b = pixels(to), perAxis = 2.0) shouldBe true
                }
            }
        }
    }

    @Test
    fun `a line is drawn twice, differently, from near its start to near its end`() {
        val from = Vec(x = -50.0, y = 100.0)
        val to = Vec(x = 1250.0, y = 700.0)
        val strokes = subpaths(rough(3).lineOps(from = from, to = to))

        strokes.size shouldBe 2
        strokes[0] shouldNotBe strokes[1]
        for (stroke in strokes) {
            near(a = stroke.start(), b = pixels(from), perAxis = 2.0) shouldBe true
            near(a = stroke.end(), b = pixels(to), perAxis = 2.0) shouldBe true
        }
    }

    @Test
    fun `each fill line and each dot is drawn twice, differently`() {
        for (style in FillStyle.entries) {
            val drawable = rough(4).ellipses(center = centre, sizes = listOf(600.0 to 400.0), fill = style)
            val strokes = subpaths(drawable.fill)

            withClue(style) {
                strokes.size shouldBeGreaterThan 0
                strokes.size % 2 shouldBe 0
                // A scan line whose ends round together has no length; roughjs draws it twice as a point.
                strokes.chunked(2).filterNot { (first, _) -> first.start() == first.end() }.forEach { (first, second) ->
                    first shouldNotBe second
                    // A line's first stroke moves its ends by up to 2 px per axis, its second by up to 1 px.
                    if (style != FillStyle.DOTS) {
                        near(a = first.start(), b = second.start(), perAxis = 3.0) shouldBe true
                        near(a = first.end(), b = second.end(), perAxis = 3.0) shouldBe true
                    }
                }
            }
        }
    }

    @Test
    fun `each fill style covers an ellipse's inside as roughjs does`() {
        // roughjs 4.6.6 itself, its 150 px circle at fillWeight 4, 100 random seeds (dots 40) as the original's
        // Date.now() seeds; seeds 1..10 would not do, its generator's first draw is near 0 for small seeds.
        val roughjs = mapOf(
            FillStyle.HACHURE to 0.949,
            FillStyle.CROSS_HATCH to 0.975,
            FillStyle.ZIGZAG to 0.975,
            FillStyle.DOTS to 0.986,
        )
        val inside = cellsWithin(a = 300.0, b = 300.0)

        for ((style, share) in roughjs) {
            val covered = (1..20).map { seed ->
                val fill = rough(seed).ellipse(center = centre, width = 600.0, height = 600.0, fill = style).fill
                cellsWithin(a = 300.0, b = 300.0, raster = raster(fill))
            }

            withClue(style) { abs(covered.sum().toDouble() / (20 * inside) - share) shouldBeLessThanOrEqual 0.03 }
            // Hachure covers most, never all: fine slivers stay white.
            if (style == FillStyle.HACHURE) covered.max() shouldBeLessThan inside
        }
    }

    @Test
    fun `cross-hatch is hachure plus a second pass`() {
        for (seed in 1..10) {
            fun cells(style: FillStyle) =
                raster(rough(seed).ellipse(center = centre, width = 600.0, height = 400.0, fill = style).fill).cells()

            cells(FillStyle.CROSS_HATCH) shouldBeGreaterThanOrEqual cells(FillStyle.HACHURE)
        }
    }

    @Test
    fun `the outline stays within roughjs's offsets of the true ellipse`() {
        val a = 500.0
        val b = 350.0
        // roughjs's numbers for 250 × 175 px, which it draws in 17 steps of θ:
        //   rx, ry move by up to 5 % (1 − curveFitting);
        //   outward a Catmull-Rom control point lies ≤ √(1 + (sin θ / 3)²) out, 0.1 / 6 more next to a 0.9·r point;
        //   inward the curve keeps outside its chords, cos(θ / 2), and closes at 0.98·r;
        //   points move ±1 px (second pass ±1.5 px) per axis, a control point ±2 px;
        //   the stroke is 2 units either side, rounding to cells adds 1.
        val theta = 2 * PI / 17
        val outer = 1.05 * (sqrt(1 + (sin(theta) / 3) * (sin(theta) / 3)) + 0.1 / 6)
        val inner = 0.95 * 0.98 * cos(theta / 2)
        val slack = slack(perAxis = 2 * scale, anyWay = Rough.OUTLINE_RADIUS + 1.0, a = a, b = b)

        for (seed in 1..20) {
            val sketch = rough(seed).ellipse(center = centre, width = 2 * a, height = 2 * b, fill = null)
            val outline = raster(sketch.outline).painted()
            val reach = outline.map { rho(p = it, a = a, b = b) }

            withClue("seed $seed") {
                reach.max() shouldBeLessThan outer + slack
                (inner - slack) shouldBeLessThan reach.min()
            }
        }
    }

    @Test
    fun `a ring leaves its hole empty`() {
        val a = 330.0
        val b = 240.0
        // The hole's polygon may shrink by 5 % and cuts chords (14 steps for 165 × 120 px). Past it a fill
        // line's end moves ≤ 2 px per axis, the polygon's points 1 px; the scan line can lag ≤ 4 px on a
        // flat edge, a line is 2 px wide either side, a dot ≤ 2.1 px around ±2 px of its line plus its stroke.
        val safe = 0.95 * cos(PI / 14) - slack(perAxis = 3 * scale, anyWay = (4 + 2 + 6.2) * scale + 1, a = a, b = b)

        for (style in FillStyle.entries) {
            for (seed in 1..5) {
                val sketch = rough(seed).ring(center = centre, width = 1100.0, height = 800.0, hole = 0.6, fill = style)
                val painted = raster(sketch.outline + sketch.fill).painted()

                withClue("$style, seed $seed") {
                    painted.filter { rho(p = it, a = a, b = b) < safe } shouldBe emptyList()
                    painted.count { rho(p = it, a = a, b = b) > 1.1 } shouldBeGreaterThan 0
                }
            }
        }
    }

    @Test
    fun `a butt end stops at its endpoint`() {
        val line = listOf(Vec(x = 100.0, y = 100.0), Vec(x = 300.0, y = 100.0))
        val straight = raster(stroke(polyline = line, radius = 8)).painted()

        straight.toSet() shouldBe (92..107).flatMap { y -> (100..299).map { x -> Point(x = x, y = y) } }.toSet()

        // Slanted: no cell centre lies before the start or past the end along the axis, one unit for rounding.
        val from = Vec(x = 100.0, y = 100.0)
        val to = Vec(x = 400.0, y = 330.0)
        val length = sqrt((to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y))
        val slanted = raster(stroke(polyline = listOf(from, to), radius = 8)).painted()
        val along = slanted.map { p ->
            ((p.x + 0.5 - from.x) * (to.x - from.x) + (p.y + 0.5 - from.y) * (to.y - from.y)) / length
        }

        along.min() shouldBe (0.0 plusOrMinus 1.0)
        along.max() shouldBe (length plusOrMinus 1.0)
    }

    @Test
    fun `a bend joins without a gap on its outside`() {
        val corner = Vec(x = 300.0, y = 100.0)
        val bend = listOf(Vec(x = 100.0, y = 100.0), corner, Vec(x = 300.0, y = 300.0))
        val bent = raster(stroke(polyline = bend, radius = 8)).painted()

        // (305.5, 94.5) is 7.8 from the corner, outside both pieces' rectangles.
        bent shouldContain Point(x = 305, y = 94)
    }

    @Test
    fun `every mark is integer, within ±10 000, and no area crosses itself`() {
        val star = List(10) { i ->
            val r = if (i % 2 == 0) 600.0 else 250.0
            Vec(x = centre.x + r * cos(PI * i / 5), y = centre.y + r * sin(PI * i / 5))
        }
        val sketches = FillStyle.entries.flatMap { style ->
            listOf(
                rough(6).ellipse(center = centre, width = 1200.0, height = 900.0, fill = style),
                rough(6).ring(center = centre, width = 1200.0, height = 900.0, hole = 0.3, fill = style),
                rough(6).shape(contours = listOf(star), fill = style),
            )
        }
        val line = rough(6).line(from = Vec(x = -2000.0, y = 100.0), to = Vec(x = 3000.0, y = 800.0), radius = 60)

        fun Mark.points() = when (this) {
            is Capsule -> listOf(Point(x = ax, y = ay), Point(x = bx, y = by))
            is Area -> points
        }
        (sketches.flatMap { it.outline + it.fill } + line).flatMap { it.points() }
            .filterNot { abs(it.x) <= 10_000 && abs(it.y) <= 10_000 } shouldBe emptyList()

        // A parallelogram of non-zero area, its corners in order around it.
        (sketches.flatMap { it.outline + it.fill } + line).filterIsInstance<Area>().filterNot { area ->
            if (area.points.size != 4) return@filterNot false
            val (p, q, r, s) = area.points
            val cross = (q.x - p.x).toLong() * (s.y - p.y) - (q.y - p.y).toLong() * (s.x - p.x)
            p.x + r.x == q.x + s.x && p.y + r.y == q.y + s.y && cross != 0L
        } shouldBe emptyList()

        sketches.flatMap { it.outline }.filterIsInstance<Capsule>().map { it.radius }.toSet() shouldBe
            setOf(Rough.OUTLINE_RADIUS)
        sketches.flatMap { it.fill }.filterIsInstance<Capsule>().map { it.radius }.toSet() shouldBe
            setOf(Rough.FILL_RADIUS)
        line.filterIsInstance<Capsule>().map { it.radius }.toSet() shouldBe setOf(60)
    }

    @Test
    fun `the original's stroke widths, scaled`() {
        Rough.OUTLINE_RADIUS shouldBe 2
        Rough.FILL_RADIUS shouldBe 8
    }

    @Test
    fun `a fill is any style`() {
        val random = SeededRandom.fromSeed(9)

        List(500) { Rough.fillOf(random) }.toSet() shouldBe FillStyle.entries.toSet()
    }
}
