package org.unividuell.countdown.core.paintratio

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.PI
import kotlin.math.roundToInt

/** What the Kollektiv Kommune paints; [tolerance] is phase one's, as a share of the canvas. */
enum class Shape(val tolerance: Double) {
    SPARKLE(0.05),
    CIRCLE(0.01),
    ELLIPSE(0.01),
    REGION(0.08),
    POLYGON(0.01),
    RING(0.01),
    STRIPES(0.03),
    SPLATTER(0.05),
    FREEHAND(0.05),
    COMPOSITION(0.08),
}

data class Layer(val mark: Mark, val argb: Int)

/** A work of the Kollektiv Kommune: its layers painted in order, later over earlier. */
class Artwork(val layers: List<Layer>) {

    fun raster(width: Int, height: Int): Raster = Raster(width = width, height = height).also { raster ->
        for (layer in layers) raster.paint(mark = layer.mark, argb = layer.argb)
    }
}

/**
 * Paints the target. Every shape aims at a share that is hard to judge by eye: rough fills with gaps,
 * overlaps that count once, a region crossing itself. The original four keep the original's ranges (its
 * 300 × 225 canvas scaled by 4); the other ranges are starting values for the lab.
 *
 * Everything comes from `SeededRandom.fromSeed(artSeed)`, trigonometry from `StrictMath`: a round
 * redraws its artwork to produce the image and has to count the same cells.
 */
object PaintRatioArtist {

    fun paint(shape: Shape, artSeed: Int, width: Int, height: Int, brushes: List<Int>): Artwork {
        val easel = Easel(random = SeededRandom.fromSeed(artSeed), width = width, height = height, brushes = brushes)
        return Artwork(easel.paint(shape))
    }

    /** 1–5 strokes with the players' brushes, each valid as a player's stroke on the wire. */
    fun freehand(random: SeededRandom, width: Int, height: Int, brushes: List<Int>): List<PaintStroke> =
        List(random.nextIntBetween(min = 1, maxInclusive = 5)) {
            PaintStroke(
                brush = random.nextInt(brushes.size),
                color = random.pick(PALETTE),
                points = walk(random = random, width = width, height = height),
            )
        }
}

/** One work in progress: its random stream and the canvas. */
private class Easel(
    private val random: SeededRandom,
    private val width: Int,
    private val height: Int,
    private val brushes: List<Int>,
) {
    private val rough = Rough(random)

    fun paint(shape: Shape): List<Layer> = when (shape) {
        Shape.SPARKLE -> sparkle()
        Shape.CIRCLE -> circle()
        Shape.ELLIPSE -> ellipse()
        Shape.REGION -> region()
        Shape.POLYGON -> polygon()
        Shape.RING -> ring()
        Shape.STRIPES -> stripes()
        Shape.SPLATTER -> splatter()
        Shape.FREEHAND -> freehand()
        Shape.COMPOSITION -> composition()
    }

    private fun sparkle(): List<Layer> = List(random.nextIntBetween(min = 10, maxInclusive = 2000)) {
        dot(
            x = random.nextIntBetween(min = 0, maxInclusive = width),
            y = random.nextIntBetween(min = 0, maxInclusive = height),
            radius = SPARKLE_RADIUS,
            argb = YELLOW,
        )
    }

    private fun circle(): List<Layer> {
        val center = center()
        val diameter = 2.0 * random.nextIntBetween(min = 40, maxInclusive = 600)
        val sketch = rough.ellipse(center = center, width = diameter, height = diameter, fill = Rough.fillOf(random))
        return sketched(sketch = sketch, argb = PURPLE)
    }

    private fun ellipse(): List<Layer> {
        val oval = oval()
        val sketch = rough.ellipse(
            center = oval.center, width = oval.width, height = oval.height, fill = Rough.fillOf(random),
        )
        return sketched(sketch = sketch, argb = PURPLE)
    }

    /** Sharp and opaque like the original; its difficulty is crossing itself. */
    private fun region(): List<Layer> {
        val points = List(random.nextIntBetween(min = 3, maxInclusive = 90)) {
            Point(
                x = random.nextIntBetween(min = 0, maxInclusive = width),
                y = random.nextIntBetween(min = 0, maxInclusive = height),
            )
        }
        return listOf(Layer(mark = Area(points), argb = GREEN))
    }

    /** A regular polygon of 3–8 corners or a star of 5–9 points, turned at random. */
    private fun polygon(): List<Layer> {
        val center = center()
        val radius = random.nextIntBetween(min = 40, maxInclusive = 600).toDouble()
        val radii = if (random.nextBoolean()) {
            val inner = radius * random.nextIntBetween(min = 40, maxInclusive = 70) / 100
            List(random.nextIntBetween(min = 5, maxInclusive = 9)) { listOf(radius, inner) }.flatten()
        } else {
            List(random.nextIntBetween(min = 3, maxInclusive = 8)) { radius }
        }
        val turn = 2 * PI * random.nextDouble()

        val corners = radii.mapIndexed { i, r ->
            val angle = turn + 2 * PI * i / radii.size
            Vec(x = center.x + r * StrictMath.cos(angle), y = center.y + r * StrictMath.sin(angle))
        }
        return sketched(sketch = rough.shape(contours = listOf(corners), fill = Rough.fillOf(random)), argb = BLUE)
    }

    /** An ellipse with a hole of 30–70 % of its size around the same centre; even-odd leaves it empty. */
    private fun ring(): List<Layer> {
        val oval = oval()
        val hole = random.nextIntBetween(min = 30, maxInclusive = 70) / 100.0
        val contours = listOf(1.0, hole).map { scale ->
            ellipseContour(center = oval.center, width = oval.width * scale, height = oval.height * scale)
        }
        return sketched(sketch = rough.shape(contours = contours, fill = Rough.fillOf(random)), argb = RED)
    }

    /**
     * 2–6 thick lines, each through a random point of the canvas at a common angle ±15°. Their ends lie
     * W + H beyond that point, so neither end nor its round cap is on the canvas.
     */
    private fun stripes(): List<Layer> {
        val base = 180 * random.nextDouble()
        val reach = (width + height).toDouble()

        return List(random.nextIntBetween(min = 2, maxInclusive = 6)) {
            val through = Vec(x = width * random.nextDouble(), y = height * random.nextDouble())
            val angle = Math.toRadians(base + 15 * uniform())
            val dx = reach * StrictMath.cos(angle)
            val dy = reach * StrictMath.sin(angle)
            rough.line(
                from = Vec(x = through.x - dx, y = through.y - dy),
                to = Vec(x = through.x + dx, y = through.y + dy),
                radius = random.nextIntBetween(min = 20, maxInclusive = 100),
            )
        }.flatten().map { Layer(mark = it, argb = TEAL) }
    }

    /**
     * 2–5 clusters of 5–80 dots, radius 8–60. A dot's offset per axis is the sum of three uniforms in −s..s:
     * bell-shaped, standard deviation s (40–200), never beyond 3s.
     */
    private fun splatter(): List<Layer> = List(random.nextIntBetween(min = 2, maxInclusive = 5)) {
        val centre = Vec(x = width * random.nextDouble(), y = height * random.nextDouble())
        val spread = random.nextIntBetween(min = 40, maxInclusive = 200).toDouble()

        List(random.nextIntBetween(min = 5, maxInclusive = 80)) {
            dot(
                x = (centre.x + (uniform() + uniform() + uniform()) * spread).roundToInt(),
                y = (centre.y + (uniform() + uniform() + uniform()) * spread).roundToInt(),
                radius = random.nextIntBetween(min = 8, maxInclusive = 60),
                argb = ORANGE,
            )
        }
    }.flatten()

    /** Through [PaintStroke.marks]: counted by the very rule that counts the players. */
    private fun freehand(): List<Layer> =
        PaintRatioArtist.freehand(random = random, width = width, height = height, brushes = brushes)
            .flatMap { stroke -> stroke.marks(brushes).map { Layer(mark = it, argb = stroke.argb()) } }

    /** 2–3 different other shapes, each from its own seed, one over the other. */
    private fun composition(): List<Layer> {
        val count = random.nextIntBetween(min = 2, maxInclusive = 3)
        val shapes = random.sample(items = Shape.entries - Shape.COMPOSITION, k = count)

        return shapes.flatMap { shape ->
            val artSeed = random.nextInt(Int.MAX_VALUE)
            PaintRatioArtist.paint(shape = shape, artSeed = artSeed, width = width, height = height, brushes = brushes)
                .layers
        }
    }

    private fun center() = Vec(
        x = random.nextIntBetween(min = MARGIN, maxInclusive = width - MARGIN).toDouble(),
        y = random.nextIntBetween(min = MARGIN, maxInclusive = height - MARGIN).toDouble(),
    )

    /** The original's ellipse: centred like the circle, it may reach past the canvas. */
    private fun oval() = Oval(
        center = center(),
        width = random.nextIntBetween(min = 40, maxInclusive = 1200).toDouble(),
        height = random.nextIntBetween(min = 80, maxInclusive = 1200).toDouble(),
    )

    /** Uniform in `−1..1`. */
    private fun uniform(): Double = 2 * random.nextDouble() - 1
}

private class Oval(val center: Vec, val width: Double, val height: Double)

/**
 * A steered random walk from a point of the canvas, free to leave and come back: 300–4000 units in 6-unit
 * steps, the heading turned each step by smoothed noise (random knots every 10 steps, eased between) of
 * strength 0.05–0.4 rad. Weak noise swings, strong noise loops and zigzags.
 */
private fun walk(random: SeededRandom, width: Int, height: Int): List<Int> {
    var x = width * random.nextDouble()
    var y = height * random.nextDouble()
    var heading = 2 * PI * random.nextDouble()
    val steps = random.nextIntBetween(min = 300, maxInclusive = 4000) / STEP
    val strength = 0.05 + 0.35 * random.nextDouble()
    val knots = DoubleArray(steps / KNOT_STEPS + 2) { 2 * random.nextDouble() - 1 }

    val points = mutableListOf(Point(x = x.roundToInt(), y = y.roundToInt()))
    for (k in 0 until steps) {
        val t = (k % KNOT_STEPS).toDouble() / KNOT_STEPS
        val from = knots[k / KNOT_STEPS]
        val to = knots[k / KNOT_STEPS + 1]
        heading += strength * (from + (to - from) * t * t * (3 - 2 * t))
        x += STEP * StrictMath.cos(heading)
        y += STEP * StrictMath.sin(heading)

        // Thinned as the client thins: a point closer than 2 units to the last one kept is dropped.
        val point = Point(x = x.roundToInt(), y = y.roundToInt())
        val last = points.last()
        val dx = point.x - last.x
        val dy = point.y - last.y
        if (dx * dx + dy * dy >= MIN_GAP * MIN_GAP) points += point
    }
    return points.flatMap { listOf(it.x, it.y) }
}

/** The fill under the outline, as roughjs draws them. */
private fun sketched(sketch: Sketch, argb: Int): List<Layer> =
    sketch.fill.map { Layer(mark = it, argb = argb) } + sketch.outline.map { Layer(mark = it, argb = BLACK) }

private fun dot(x: Int, y: Int, radius: Int, argb: Int) =
    Layer(mark = Capsule(ax = x, ay = y, bx = x, by = y, radius = radius), argb = argb)

private const val MARGIN = 40
private const val SPARKLE_RADIUS = 20
private const val STEP = 6
private const val KNOT_STEPS = 10
private const val MIN_GAP = 2

private const val BLACK = 0xFF000000.toInt()
private const val YELLOW = 0xFFEFC202.toInt()
private const val PURPLE = 0xFF841ED6.toInt()
private const val GREEN = 0xFF008000.toInt()
private const val BLUE = 0xFF2563EB.toInt()
private const val RED = 0xFFDC2626.toInt()
private const val TEAL = 0xFF0F766E.toInt()
private const val ORANGE = 0xFFEA580C.toInt()

/** Lower case, as a player's colour on the wire. */
private val PALETTE = listOf("#3049e8", "#e8304f", "#f2b705", "#2a9d4b", "#111111", "#8e44ad", "#f07c1b")
