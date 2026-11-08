package org.unividuell.countdown.core.paintratio

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.PI
import kotlin.math.roundToInt

/** What the Kollektiv Kommune paints; [tolerance] is phase one's, as a share of the canvas. */
enum class Shape(val tolerance: Double) {
    SPARKLE(0.05),
    REGION(0.08),
    SPLATTER(0.05),
    FREEHAND(0.05),
}

data class Layer(val mark: Mark, val argb: Int)

/** A work of the Kollektiv Kommune: its layers painted in order, later over earlier. */
class Artwork(val layers: List<Layer>) {

    fun raster(width: Int, height: Int): Raster = Raster(width = width, height = height).also { raster ->
        for (layer in layers) raster.paint(mark = layer.mark, argb = layer.argb)
    }
}

/**
 * Paints the target. Every shape aims at a share that is hard to judge by eye: overlaps that count
 * once, a region crossing itself. Sparkle and region keep the original's ranges (its 300 × 225 canvas
 * scaled by 4); the other ranges are starting values for the lab.
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
    fun paint(shape: Shape): List<Layer> = when (shape) {
        Shape.SPARKLE -> sparkle()
        Shape.REGION -> region()
        Shape.SPLATTER -> splatter()
        Shape.FREEHAND -> freehand()
    }

    private fun sparkle(): List<Layer> = List(random.nextIntBetween(min = 10, maxInclusive = 2000)) {
        dot(
            x = random.nextIntBetween(min = 0, maxInclusive = width),
            y = random.nextIntBetween(min = 0, maxInclusive = height),
            radius = SPARKLE_RADIUS,
            argb = YELLOW,
        )
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

    /** Uniform in `−1..1`. */
    private fun uniform(): Double = 2 * random.nextDouble() - 1
}

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

private fun dot(x: Int, y: Int, radius: Int, argb: Int) =
    Layer(mark = Capsule(ax = x, ay = y, bx = x, by = y, radius = radius), argb = argb)

private const val SPARKLE_RADIUS = 20
private const val STEP = 6
private const val KNOT_STEPS = 10
private const val MIN_GAP = 2

private const val YELLOW = 0xFFEFC202.toInt()
private const val GREEN = 0xFF008000.toInt()
private const val ORANGE = 0xFFEA580C.toInt()

/** Lower case, as a player's colour on the wire. */
private val PALETTE = listOf("#3049e8", "#e8304f", "#f2b705", "#2a9d4b", "#111111", "#8e44ad", "#f07c1b")
