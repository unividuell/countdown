package org.unividuell.countdown.core.paintratio

import io.kotest.matchers.longs.shouldBeLessThan
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.time.measureTime

class RasterTest {

    private val black = 0xFF000000.toInt()
    private val red = 0xFFE8304F.toInt()
    private val blue = 0xFF3049E8.toInt()

    private fun Raster.coveredCells(mark: Mark): Int =
        (0 until height).sumOf { y -> (0 until width).count { x -> covers(mark = mark, x = x, y = y) } }

    @Test
    fun `a dot of radius 3 at a grid point covers 32 cells`() {
        val raster = Raster(width = 100, height = 100)
        raster.paint(mark = Capsule(ax = 50, ay = 50, bx = 50, by = 50, radius = 3), argb = black)
        raster.cells() shouldBe 32
    }

    @Test
    fun `a horizontal stroke of radius 1 covers two rows of twelve`() {
        val raster = Raster(width = 100, height = 100)
        raster.paint(mark = Capsule(ax = 10, ay = 10, bx = 20, by = 10, radius = 1), argb = black)
        raster.cells() shouldBe 24
    }

    @Test
    fun `a square area covers exactly its inside`() {
        val raster = Raster(width = 100, height = 100)
        val square = Area(
            points = listOf(Point(x = 0, y = 0), Point(x = 10, y = 0), Point(x = 10, y = 10), Point(x = 0, y = 10)),
        )
        raster.paint(mark = square, argb = black)
        raster.cells() shouldBe 100
    }

    @Test
    fun `painting twice counts once`() {
        val raster = Raster(width = 100, height = 100)
        val dot = Capsule(ax = 50, ay = 50, bx = 50, by = 50, radius = 3)
        raster.paint(mark = dot, argb = black)
        raster.paint(mark = dot, argb = red)
        raster.cells() shouldBe 32
    }

    @Test
    fun `the fast raster agrees with the rule cell by cell`() {
        val random = SeededRandom.fromSeed(7)
        fun end() = random.nextIntBetween(min = -200, maxInclusive = 300)
        val capsules = List(200) {
            val radius = random.nextIntBetween(min = 0, maxInclusive = 80)
            Capsule(ax = end(), ay = end(), bx = end(), by = end(), radius = radius)
        }
        val pentagram = Area(
            points = listOf(
                Point(x = 120, y = 10), Point(x = 167, y = 155), Point(x = 44, y = 65),
                Point(x = 196, y = 65), Point(x = 73, y = 155),
            ),
        )
        // Diagonals at 45° put crossings exactly on cell centres; one edge is horizontal; corners lie outside.
        val selfIntersecting = Area(
            points = listOf(
                Point(x = -30, y = 20), Point(x = 130, y = 180), Point(x = 260, y = 50), Point(x = 100, y = 50),
                Point(x = 100, y = 200), Point(x = 10, y = 110), Point(x = 150, y = -30),
            ),
        )

        val disagreements = (capsules + pentagram + selfIntersecting).associateWith { mark ->
            val raster = Raster(width = 240, height = 180).also { it.paint(mark = mark, argb = black) }
            (0 until raster.height).sumOf { y ->
                (0 until raster.width).count { x ->
                    raster.isPainted(x = x, y = y) != covers(mark = mark, x = x, y = y)
                }
            }
        }.filterValues { it > 0 }

        disagreements shouldBe emptyMap()
    }

    @Test
    fun `marks reaching outside count only their inside part`() {
        val capsule = Capsule(ax = -10, ay = 50, bx = 10, by = 50, radius = 2)
        val triangle = Area(points = listOf(Point(x = -50, y = -50), Point(x = 60, y = 30), Point(x = 20, y = 120)))

        val capsuleRaster = Raster(width = 100, height = 100).also { it.paint(mark = capsule, argb = black) }
        val triangleRaster = Raster(width = 100, height = 100).also { it.paint(mark = triangle, argb = black) }

        capsuleRaster.cells() shouldBe 46
        capsuleRaster.cells() shouldBe capsuleRaster.coveredCells(capsule)
        triangleRaster.cells() shouldBe triangleRaster.coveredCells(triangle)
    }

    @Test
    fun `the png decodes to exactly the painted cells, in their colours`() {
        val raster = Raster(width = 100, height = 80)
        raster.paint(mark = Capsule(ax = 30, ay = 40, bx = 30, by = 40, radius = 20), argb = red)
        raster.paint(mark = Capsule(ax = 20, ay = 10, bx = 60, by = 70, radius = 6), argb = blue)

        val image = ImageIO.read(ByteArrayInputStream(raster.png()))

        image.width shouldBe 100
        image.height shouldBe 80
        (0 until 80).sumOf { y -> (0 until 100).count { x -> image.getRGB(x, y) ushr 24 != 0 } } shouldBe raster.cells()
        image.getRGB(15, 40) shouldBe red
        image.getRGB(36, 35) shouldBe blue
    }

    @Test
    fun `the largest guess counts in under a second`() {
        val random = SeededRandom.fromSeed(11)
        var x = PaintCanvas.WIDTH / 2
        var y = PaintCanvas.HEIGHT / 2
        val points = ArrayList<Int>(200_000)
        fun step(from: Int) = (from + random.nextIntBetween(min = -6, maxInclusive = 6))
            .coerceIn(minimumValue = -10_000, maximumValue = 10_000)
        repeat(100_000) {
            x = step(x)
            y = step(y)
            points += x
            points += y
        }
        val strokes = listOf(PaintStroke(brush = 2, color = "#3049e8", points = points))
        fun count() = Raster(width = PaintCanvas.WIDTH, height = PaintCanvas.HEIGHT)
            .also { it.paint(strokes = strokes, brushes = PaintCanvas.BRUSHES) }
            .cells()

        count()
        // The best of three: one slow run on a busy CI runner says nothing about the cost.
        val elapsed = (1..3).minOf { measureTime { count() } }

        elapsed.inWholeMilliseconds shouldBeLessThan 1000L
    }
}
