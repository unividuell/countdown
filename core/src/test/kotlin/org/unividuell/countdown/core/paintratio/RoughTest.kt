package org.unividuell.countdown.core.paintratio

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

class RoughTest {

    private val black = 0xFF000000.toInt()
    private val centre = Vec(x = PaintCanvas.WIDTH / 2.0, y = PaintCanvas.HEIGHT / 2.0)
    private val gaps = listOf(Rough.GAPS.first, Rough.GAPS.last)

    private fun rough(seed: Int) = Rough(SeededRandom.fromSeed(seed))

    /** The ellipse 600 × 400 at the canvas centre. */
    private fun ellipse(fill: Fill?, seed: Int = 1) =
        rough(seed).ellipse(center = centre, width = 600.0, height = 400.0, fill = fill)

    private fun raster(marks: List<Mark>) = Raster(width = PaintCanvas.WIDTH, height = PaintCanvas.HEIGHT)
        .also { raster -> marks.forEach { raster.paint(mark = it, argb = black) } }

    private fun cells(marks: List<Mark>) = raster(marks).cells()

    private fun Raster.painted(): Set<Point> = (0 until height).flatMap { y ->
        (0 until width).filter { x -> isPainted(x = x, y = y) }.map { x -> Point(x = x, y = y) }
    }.toSet()

    /** Whether cell `p`'s centre lies within the ellipse of semi-axes `a`, `b` around the canvas centre. */
    private fun within(p: Point, a: Double, b: Double): Boolean {
        val dx = (p.x + 0.5 - centre.x) / a
        val dy = (p.y + 0.5 - centre.y) / b
        return dx * dx + dy * dy <= 1
    }

    private fun contour(a: Double, b: Double) = List(64) { i ->
        val angle = 2 * PI * i / 64
        Vec(x = centre.x + a * cos(angle), y = centre.y + b * sin(angle))
    }

    @Test
    fun `the same seed draws the same sketch`() {
        for (style in FillStyle.entries) {
            ellipse(fill = Fill(style = style, gap = 32), seed = 5) shouldBe
                ellipse(fill = Fill(style = style, gap = 32), seed = 5)
        }
        rough(5).line(from = Vec(x = -50.0, y = 100.0), to = Vec(x = 1250.0, y = 700.0), radius = 30) shouldBe
            rough(5).line(from = Vec(x = -50.0, y = 100.0), to = Vec(x = 1250.0, y = 700.0), radius = 30)
    }

    @Test
    fun `another seed draws another outline`() {
        ellipse(fill = null, seed = 1).outline shouldNotBe ellipse(fill = null, seed = 2).outline
    }

    @Test
    fun `the outline is no perfect ellipse`() {
        val smooth = List(721) { i ->
            val angle = 2 * PI * i / 720
            Point(x = (centre.x + 300 * cos(angle)).roundToInt(), y = (centre.y + 200 * sin(angle)).roundToInt())
        }.zipWithNext { a, b -> Capsule(ax = a.x, ay = a.y, bx = b.x, by = b.y, radius = Rough.OUTLINE_RADIUS) }

        val outline = raster(ellipse(fill = null).outline).painted()

        // Without jitter only rounding differs, about 350 cells; with it, over a quarter of the outline.
        (outline - raster(smooth).painted()).size shouldBeGreaterThan outline.size / 4
    }

    @Test
    fun `a narrower gap paints more`() {
        cells(ellipse(fill = Fill(style = FillStyle.HACHURE, gap = 16)).fill) shouldBeGreaterThan
            cells(ellipse(fill = Fill(style = FillStyle.HACHURE, gap = 64)).fill)
    }

    @Test
    fun `dots paint less than hachure at the same gap`() {
        for (gap in gaps) {
            cells(ellipse(fill = Fill(style = FillStyle.DOTS, gap = gap)).fill) shouldBeLessThan
                cells(ellipse(fill = Fill(style = FillStyle.HACHURE, gap = gap)).fill)
        }
    }

    @Test
    fun `cross-hatch paints more than hachure at the same gap`() {
        for (gap in gaps) {
            cells(ellipse(fill = Fill(style = FillStyle.CROSS_HATCH, gap = gap)).fill) shouldBeGreaterThan
                cells(ellipse(fill = Fill(style = FillStyle.HACHURE, gap = gap)).fill)
        }
    }

    @Test
    fun `zigzag connects its lines`() {
        for (gap in gaps) {
            cells(ellipse(fill = Fill(style = FillStyle.ZIGZAG, gap = gap)).fill) shouldBeGreaterThan
                cells(ellipse(fill = Fill(style = FillStyle.HACHURE, gap = gap)).fill)
        }
    }

    @Test
    fun `fill lines fray past the outline`() {
        for (style in FillStyle.entries) {
            for (gap in gaps) {
                val fill = raster(ellipse(fill = Fill(style = style, gap = gap)).fill).painted()

                // The ellipse with semi-axes 24 longer stays within 24 units of the exact one.
                fill.filterNot { within(p = it, a = 324.0, b = 224.0) } shouldBe emptyList()

                // Beyond 10 units only a frayed end reaches: a brush of radius 8 at the edge does not.
                if (style != FillStyle.DOTS) {
                    fill.count { !within(p = it, a = 310.0, b = 210.0) } shouldBeGreaterThan 0
                }
            }
        }
    }

    @Test
    fun `a ring leaves its hole empty`() {
        val ring = listOf(contour(a = 300.0, b = 200.0), contour(a = 150.0, b = 100.0))

        for (style in FillStyle.entries) {
            val sketch = rough(3).shape(contours = ring, fill = Fill(style = style, gap = 16))
            val painted = raster(sketch.outline + sketch.fill).painted()

            painted.filter { within(p = it, a = 110.0, b = 60.0) } shouldBe emptyList()
            painted.count { !within(p = it, a = 150.0, b = 100.0) } shouldBeGreaterThan 0
        }
    }

    @Test
    fun `everything is integer marks`() {
        for (style in FillStyle.entries) {
            val sketch = ellipse(fill = Fill(style = style, gap = 40))

            sketch.outline.map { (it as? Capsule)?.radius }.toSet() shouldBe setOf(Rough.OUTLINE_RADIUS)
            sketch.fill.map { (it as? Capsule)?.radius }.toSet() shouldBe setOf(Rough.FILL_RADIUS)
        }
        rough(1).line(from = Vec(x = -50.0, y = 100.0), to = Vec(x = 1250.0, y = 700.0), radius = 30)
            .map { (it as? Capsule)?.radius }.toSet() shouldBe setOf(30)
    }

    @Test
    fun `a fill needs a positive gap`() {
        shouldThrow<IllegalArgumentException> { Fill(style = FillStyle.DOTS, gap = 0) }
    }

    @Test
    fun `a fill is any style at any gap`() {
        val random = SeededRandom.fromSeed(9)
        val fills = List(500) { Rough.fillOf(random) }

        fills.map { it.style }.toSet() shouldBe FillStyle.entries.toSet()
        fills.map { it.gap }.toSet() shouldBe Rough.GAPS.toSet()
    }
}
