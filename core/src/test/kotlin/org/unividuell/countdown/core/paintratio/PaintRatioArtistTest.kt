package org.unividuell.countdown.core.paintratio

import io.kotest.assertions.withClue
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class PaintRatioArtistTest {

    private val width = PaintCanvas.WIDTH
    private val height = PaintCanvas.HEIGHT
    private val brushes = PaintCanvas.BRUSHES

    private fun paint(shape: Shape, seed: Int) =
        PaintRatioArtist.paint(shape = shape, artSeed = seed, width = width, height = height, brushes = brushes)

    private fun png(shape: Shape, seed: Int) =
        paint(shape = shape, seed = seed).raster(width = width, height = height).png()

    private fun freehand(seed: Int) = PaintRatioArtist.freehand(
        random = SeededRandom.fromSeed(seed),
        width = width,
        height = height,
        brushes = brushes,
    )

    @Test
    fun `the tolerances are the spec's`() {
        Shape.entries.associateWith { it.tolerance } shouldBe mapOf(
            Shape.SPARKLE to 0.05, Shape.REGION to 0.08, Shape.SPLATTER to 0.05, Shape.FREEHAND to 0.05,
            Shape.SIERPINSKI_TRIANGLE to 0.03, Shape.SIERPINSKI_CARPET to 0.05, Shape.PYTHAGORAS_TREE to 0.03,
            Shape.FERN to 0.03, Shape.JULIA to 0.03, Shape.ROSE to 0.01, Shape.SPIROGRAPH to 0.01,
            Shape.LISSAJOUS to 0.03, Shape.PHYLLOTAXIS to 0.01, Shape.TRUCHET to 0.05, Shape.SPIRAL to 0.03,
        )
    }

    @Test
    fun `every shape but freehand paints in one colour`() {
        for (shape in Shape.entries - Shape.FREEHAND) {
            for (seed in 1..10) {
                withClue("$shape, seed $seed") {
                    paint(shape = shape, seed = seed).layers.map { it.argb }.toSet().size shouldBe 1
                }
            }
        }
    }

    @Test
    fun `the fractals repeat their part per level`() {
        for (seed in 1..20) {
            // Depth 4–6: 3ⁿ triangles. Depth 3–4: 8ⁿ squares. Depth 9–11: 2ⁿ⁺¹ − 1 squares.
            paint(shape = Shape.SIERPINSKI_TRIANGLE, seed = seed).layers.size shouldBeIn listOf(81, 243, 729)
            paint(shape = Shape.SIERPINSKI_CARPET, seed = seed).layers.size shouldBeIn listOf(512, 4096)
            paint(shape = Shape.PYTHAGORAS_TREE, seed = seed).layers.size shouldBeIn listOf(1023, 2047, 4095)
        }
    }

    @Test
    fun `fern and phyllotaxis are dots`() {
        for (seed in 1..20) {
            val fern = paint(shape = Shape.FERN, seed = seed).layers.map { it.mark.shouldBeInstanceOf<Capsule>() }
            fern.size shouldBeInRange 4000..12000
            fern.filterNot { it.ax == it.bx && it.ay == it.by && it.radius in 3..5 } shouldBe emptyList()

            val seeds = paint(shape = Shape.PHYLLOTAXIS, seed = seed).layers
                .map { it.mark.shouldBeInstanceOf<Capsule>() }
            seeds.size shouldBeInRange 150..700
            seeds.filterNot { it.ax == it.bx && it.ay == it.by } shouldBe emptyList()
        }
    }

    @Test
    fun `rose and spirograph are one area filled even-odd`() {
        for (seed in 1..20) {
            for (shape in listOf(Shape.ROSE, Shape.SPIROGRAPH)) {
                paint(shape = shape, seed = seed).layers.single().mark.shouldBeInstanceOf<Area>()
            }
        }
    }

    @Test
    fun `every shape paints something and never everything`() {
        for (shape in Shape.entries) {
            for (seed in 1..20) {
                val cells = paint(shape = shape, seed = seed).raster(width = width, height = height).cells()

                withClue("$shape, seed $seed") {
                    cells shouldBeGreaterThan 0
                    cells shouldBeLessThan width * height
                }
            }
        }
    }

    @Test
    fun `the same seed paints the same bytes`() {
        for (shape in Shape.entries) {
            png(shape = shape, seed = 7) shouldBe png(shape = shape, seed = 7)
            png(shape = shape, seed = 7) shouldNotBe png(shape = shape, seed = 8)
        }
    }

    @Test
    fun `sparkle and region wear the original colours`() {
        for (seed in 1..20) {
            paint(shape = Shape.SPARKLE, seed = seed).layers.map { it.argb }.toSet() shouldBe setOf(0xFFEFC202.toInt())
            paint(shape = Shape.REGION, seed = seed).layers.map { it.argb }.toSet() shouldBe setOf(0xFF008000.toInt())
        }
    }

    @Test
    fun `sparkles are dots of radius 20`() {
        for (seed in 1..20) {
            val dots = paint(shape = Shape.SPARKLE, seed = seed).layers.map { it.mark.shouldBeInstanceOf<Capsule>() }

            dots.size shouldBeInRange 10..2000
            dots.filterNot { it.ax == it.bx && it.ay == it.by && it.radius == 20 } shouldBe emptyList()
            dots.filterNot { it.ax in 0..width && it.ay in 0..height } shouldBe emptyList()
        }
    }

    @Test
    fun `a region is one sharp area`() {
        for (seed in 1..20) {
            val layers = paint(shape = Shape.REGION, seed = seed).layers
            layers.size shouldBe 1

            val area = layers.single().mark.shouldBeInstanceOf<Area>()
            area.points.size shouldBeInRange 3..90
            area.points.filterNot { it.x in 0..width && it.y in 0..height } shouldBe emptyList()
        }
    }

    @Test
    fun `freehand paints with the players' brushes`() {
        val palette = listOf("#3049e8", "#e8304f", "#f2b705", "#2a9d4b", "#111111", "#8e44ad", "#f07c1b")

        for (seed in 1..50) {
            val strokes = freehand(seed)
            strokes.size shouldBeInRange 1..5

            for (stroke in strokes) {
                stroke.brush shouldBeInRange brushes.indices
                stroke.color shouldBeIn palette
                stroke.points.size % 2 shouldBe 0
                stroke.points.filterNot { it in -10_000..10_000 } shouldBe emptyList()

                // The client's thinning: no point closer than 2 units to the one before.
                val points = stroke.points.chunked(2)
                points.size shouldBeGreaterThan 0
                points.zipWithNext().filter { (p, q) ->
                    (q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]) < 4
                } shouldBe emptyList()
            }
        }
    }

    @Test
    fun `freehand is counted by the players' rule`() {
        for (seed in 1..10) {
            val players = Raster(width = width, height = height)
                .also { it.paint(strokes = freehand(seed), brushes = brushes) }

            png(shape = Shape.FREEHAND, seed = seed) shouldBe players.png()
        }
    }
}
