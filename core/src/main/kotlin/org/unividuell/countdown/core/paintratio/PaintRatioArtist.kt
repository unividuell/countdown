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
    SIERPINSKI_TRIANGLE(0.03),
    SIERPINSKI_CARPET(0.05),
    PYTHAGORAS_TREE(0.03),
    FERN(0.03),
    JULIA(0.03),
    ROSE(0.01),
    SPIROGRAPH(0.01),
    LISSAJOUS(0.03),
    PHYLLOTAXIS(0.01),
    TRUCHET(0.05),
    SPIRAL(0.03),
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
 * once, a region crossing itself, fractal gaps, curves filled even-odd. Sparkle and region keep the
 * original's ranges (its 300 × 225 canvas scaled by 4); the other ranges are starting values for the lab.
 *
 * Everything comes from `SeededRandom.fromSeed(artSeed)`, trigonometry from `StrictMath`: a round
 * redraws its artwork to produce the image and has to count the same cells.
 */
object PaintRatioArtist {

    fun paint(shape: Shape, artSeed: Int, width: Int, height: Int, brushes: List<Int>): Artwork {
        val easel = Easel(random = SeededRandom.fromSeed(artSeed), width = width, height = height, brushes = brushes)
        return Artwork(easel.paint(shape))
    }

    /**
     * 1–5 strokes with the players' brushes, each valid as a player's stroke on the wire. Their colours are
     * neighbours: one drawn base hue, the strokes at most 12° from it, set apart by lightness.
     */
    fun freehand(random: SeededRandom, width: Int, height: Int, brushes: List<Int>): List<PaintStroke> {
        val palette = analogPalette(baseHue = 360 * random.nextDouble())
        return List(random.nextIntBetween(min = 1, maxInclusive = 5)) { i ->
            PaintStroke(
                brush = random.nextInt(brushes.size),
                color = palette[i % palette.size],
                points = walk(random = random, width = width, height = height),
            )
        }
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
        Shape.SIERPINSKI_TRIANGLE -> sierpinskiTriangle()
        Shape.SIERPINSKI_CARPET -> sierpinskiCarpet()
        Shape.PYTHAGORAS_TREE -> pythagorasTree()
        Shape.FERN -> fern()
        Shape.JULIA -> julia()
        Shape.ROSE -> rose()
        Shape.SPIROGRAPH -> spirograph()
        Shape.LISSAJOUS -> lissajous()
        Shape.PHYLLOTAXIS -> phyllotaxis()
        Shape.TRUCHET -> truchet()
        Shape.SPIRAL -> spiral()
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

    /** Depth 4–6 of halving a turned triangle: 3ⁿ leaves, the holes in between stay empty. */
    private fun sierpinskiTriangle(): List<Layer> {
        val depth = random.nextIntBetween(min = 4, maxInclusive = 6)
        val radius = between(min = 380.0, max = 560.0)
        val centre = centre()
        val turn = 2 * PI * random.nextDouble()
        val top = Vec(x = centre.x, y = centre.y - radius)
        val corners = (0..2).map { turned(v = top, centre = centre, angle = turn + 2 * PI * it / 3) }

        val leaves = mutableListOf<Layer>()
        fun split(a: Vec, b: Vec, c: Vec, level: Int) {
            if (level == 0) {
                leaves += area(points = listOf(a, b, c), argb = GREEN)
                return
            }
            val ab = middle(a = a, b = b)
            val bc = middle(a = b, b = c)
            val ca = middle(a = c, b = a)
            split(a = a, b = ab, c = ca, level = level - 1)
            split(a = ab, b = b, c = bc, level = level - 1)
            split(a = ca, b = bc, c = c, level = level - 1)
        }
        split(a = corners[0], b = corners[1], c = corners[2], level = depth)
        return leaves
    }

    /** Depth 3–4 of ninths without their middle: 8ⁿ squares, upright or turned. */
    private fun sierpinskiCarpet(): List<Layer> {
        val depth = random.nextIntBetween(min = 3, maxInclusive = 4)
        val size = between(min = 650.0, max = 860.0)
        val centre = centre()
        val turn = if (random.nextBoolean()) 0.0 else PI / 2 * random.nextDouble()

        val squares = mutableListOf<Layer>()
        fun split(x: Double, y: Double, side: Double, level: Int) {
            if (level == 0) {
                val corners = listOf(
                    Vec(x = x, y = y),
                    Vec(x = x + side, y = y),
                    Vec(x = x + side, y = y + side),
                    Vec(x = x, y = y + side),
                )
                squares += area(points = corners.map { turned(v = it, centre = centre, angle = turn) }, argb = BLUE)
                return
            }
            val third = side / 3
            for (i in 0..2) for (j in 0..2) {
                if (i != 1 || j != 1) split(x = x + i * third, y = y + j * third, side = third, level = level - 1)
            }
        }
        split(x = centre.x - size / 2, y = centre.y - size / 2, side = size, level = depth)
        return squares
    }

    /**
     * A square on the bottom edge, two smaller ones on the legs of a right triangle on top, and so on for
     * 9–11 levels: 2ⁿ⁺¹ − 1 squares. The angle (30–60°) bends the crown.
     */
    private fun pythagorasTree(): List<Layer> {
        val depth = random.nextIntBetween(min = 9, maxInclusive = 11)
        val side = between(min = 100.0, max = 150.0)
        val angle = Math.toRadians(between(min = 30.0, max = 60.0))
        val left = width / 2 - side / 2 + between(min = -100.0, max = 100.0)
        val cos = StrictMath.cos(angle)
        val sin = StrictMath.sin(angle)

        val squares = mutableListOf<Layer>()
        fun grow(p1: Vec, p2: Vec, level: Int) {
            // y points down, so "up" from the base p1 → p2 is (dy, −dx).
            val dx = p2.x - p1.x
            val dy = p2.y - p1.y
            val p3 = Vec(x = p2.x + dy, y = p2.y - dx)
            val p4 = Vec(x = p1.x + dy, y = p1.y - dx)
            squares += area(points = listOf(p1, p2, p3, p4), argb = TEAL)
            if (level == 0) return

            val apex = Vec(x = p4.x + cos * (dx * cos + dy * sin), y = p4.y + cos * (-dx * sin + dy * cos))
            grow(p1 = p4, p2 = apex, level = level - 1)
            grow(p1 = apex, p2 = p3, level = level - 1)
        }
        grow(p1 = Vec(x = left, y = height - 30.0), p2 = Vec(x = left + side, y = height - 30.0), level = depth)
        return squares
    }

    /** Barnsley's fern: 4000–12000 dots of radius 3–5 from its four maps, mirrored at random. */
    private fun fern(): List<Layer> {
        val count = random.nextIntBetween(min = 4000, maxInclusive = 12000)
        val radius = random.nextIntBetween(min = 3, maxInclusive = 5)
        val mirror = if (random.nextBoolean()) -1 else 1
        val stem = width / 2 + between(min = -150.0, max = 150.0)

        var x = 0.0
        var y = 0.0
        return List(count) {
            val p = random.nextDouble()
            val nx: Double
            val ny: Double
            when {
                p < 0.01 -> { nx = 0.0; ny = 0.16 * y }
                p < 0.86 -> { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6 }
                p < 0.93 -> { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6 }
                else -> { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44 }
            }
            x = nx
            y = ny
            dot(
                x = (stem + mirror * x * FERN_SCALE).roundToInt(),
                y = (height - 20 - y * FERN_SCALE).roundToInt(),
                radius = radius,
                argb = GREEN,
            )
        }
    }

    /**
     * A filled Julia set of one of six well-known parameters, plus every second or third escape band, in
     * 4-unit blocks. Each block row merges into runs, so a band is one area rather than hundreds.
     */
    private fun julia(): List<Layer> {
        val (cr, ci) = random.pick(JULIA_PARAMETERS)
        val span = between(min = 3.0, max = 3.6)
        val bands = random.nextIntBetween(min = 2, maxInclusive = 3)

        return blocks(argb = ORANGE) { bx, by ->
            var zr = (bx * BLOCK + BLOCK / 2.0 - width / 2.0) / width * span
            var zi = (by * BLOCK + BLOCK / 2.0 - height / 2.0) / width * span
            var n = 0
            while (n < JULIA_ITERATIONS && zr * zr + zi * zi < 4) {
                val next = zr * zr - zi * zi + cr
                zi = 2 * zr * zi + ci
                zr = next
                n++
            }
            n == JULIA_ITERATIONS || (n > 2 && n % bands == 0)
        }
    }

    /** r = R·cos(k·θ) for k = n/d, filled even-odd. Odd n and d close after π·d; tracing twice would empty it. */
    private fun rose(): List<Layer> {
        val (n, d) = random.pick(ROSE_RATIOS)
        val period = if (n % 2 == 1 && d % 2 == 1) PI * d else 2 * PI * d
        val radius = between(min = 330.0, max = 440.0)
        val centre = centre()
        val turn = 2 * PI * random.nextDouble()

        val points = List(CURVE_POINTS) {
            val t = period * it / CURVE_POINTS
            val r = radius * StrictMath.cos(n.toDouble() / d * t)
            Vec(x = centre.x + r * StrictMath.cos(t + turn), y = centre.y + r * StrictMath.sin(t + turn))
        }
        return listOf(area(points = points, argb = RED))
    }

    /**
     * A hypotrochoid: a circle of radius r (2 … R−1, coprime to R) rolls inside one of radius R (5–13), the pen
     * at distance d = 1–1.6·r. A pen on or beyond the rim makes loops and points; inside it, a blob. Filled
     * even-odd.
     */
    private fun spirograph(): List<Layer> {
        val big = random.nextIntBetween(min = 5, maxInclusive = 13)
        val small = random.pick((2 until big).filter { gcd(a = big, b = it) == 1 })
        val pen = small * between(min = 1.0, max = 1.6)
        val centre = centre()
        val scale = between(min = 360.0, max = 440.0) / (big - small + pen)
        val turns = small / gcd(a = big, b = small)
        val ratio = (big - small).toDouble() / small

        val points = List(SPIROGRAPH_POINTS) {
            val t = 2 * PI * turns * it / SPIROGRAPH_POINTS
            Vec(
                x = centre.x + scale * ((big - small) * StrictMath.cos(t) + pen * StrictMath.cos(ratio * t)),
                y = centre.y + scale * ((big - small) * StrictMath.sin(t) - pen * StrictMath.sin(ratio * t)),
            )
        }
        return listOf(area(points = points, argb = PURPLE))
    }

    /** x = sin(a·t + δ), y = sin(b·t) for coprime a ≠ b in 1–5, as one thick line of radius 10–32. */
    private fun lissajous(): List<Layer> {
        val (a, b) = random.pick(LISSAJOUS_RATIOS)
        val delta = PI * random.nextDouble()
        val radius = random.nextIntBetween(min = 10, maxInclusive = 32)

        val points = (0..CURVE_POINTS).map {
            val t = 2 * PI * it / CURVE_POINTS
            Vec(x = width / 2 + 500 * StrictMath.sin(a * t + delta), y = height / 2 + 370 * StrictMath.sin(b * t))
        }
        return line(points = points, argb = TEAL) { radius }
    }

    /** A sunflower: 150–700 dots, the i-th at √i out and i golden angles round, same size or growing outwards. */
    private fun phyllotaxis(): List<Layer> {
        val count = random.nextIntBetween(min = 150, maxInclusive = 700)
        val centre = centre()
        val spread = between(min = 380.0, max = 470.0) / StrictMath.sqrt(count.toDouble())
        val size = spread * between(min = 0.35, max = 0.65)
        val growing = random.nextBoolean()
        val golden = PI * (3 - StrictMath.sqrt(5.0))

        return (1..count).map { i ->
            val r = spread * StrictMath.sqrt(i.toDouble())
            val radius = if (growing) size * (0.3 + 1.2 * i / count) else size
            dot(
                x = (centre.x + r * StrictMath.cos(i * golden)).roundToInt(),
                y = (centre.y + r * StrictMath.sin(i * golden)).roundToInt(),
                radius = radius.roundToInt(),
                argb = YELLOW,
            )
        }
    }

    /** Tiles of 75, 100 or 150 units, each with two quarter arcs joining its edge midpoints one of two ways. */
    private fun truchet(): List<Layer> {
        val tile = random.pick(TRUCHET_TILES)
        val radius = (tile * between(min = 0.1, max = 0.22)).roundToInt()
        val half = tile / 2.0

        val arcs = mutableListOf<Layer>()
        for (ty in 0 until height / tile) for (tx in 0 until width / tile) {
            val x = tx * tile.toDouble()
            val y = ty * tile.toDouble()
            val corners = if (random.nextBoolean()) {
                listOf(Vec(x = x, y = y) to 0.0, Vec(x = x + tile, y = y + tile) to PI)
            } else {
                listOf(Vec(x = x + tile, y = y) to PI / 2, Vec(x = x, y = y + tile) to 3 * PI / 2)
            }
            for ((corner, start) in corners) {
                val arc = (0..ARC_STEPS).map {
                    val a = start + PI / 2 * it / ARC_STEPS
                    Vec(x = corner.x + half * StrictMath.cos(a), y = corner.y + half * StrictMath.sin(a))
                }
                arcs += line(points = arc, argb = BLUE) { radius }
            }
        }
        return arcs
    }

    /** 1–4 logarithmic arms out to 700 units, each thickening with its distance from the centre. */
    private fun spiral(): List<Layer> {
        val arms = random.nextIntBetween(min = 1, maxInclusive = 4)
        val growth = between(min = 0.12, max = 0.3)
        val centre = centre()
        val turn = 2 * PI * random.nextDouble()
        val thickness = between(min = 0.06, max = 0.16)

        return (0 until arms).flatMap { arm ->
            val points = generateSequence(0.0) { it + SPIRAL_STEP }
                .map { t -> t to 8 * StrictMath.exp(growth * t) }
                .takeWhile { (_, r) -> r <= 700 }
                .map { (t, r) ->
                    val a = t + turn + 2 * PI * arm / arms
                    Vec(x = centre.x + r * StrictMath.cos(a), y = centre.y + r * StrictMath.sin(a))
                }
                .toList()
            line(points = points, argb = BLUE) { (2 + thickness * distance(a = it, b = centre)).roundToInt() }
        }
    }

    /** Blocks of [BLOCK] units where [inside] holds, merged per row into runs. */
    private fun blocks(argb: Int, inside: (Int, Int) -> Boolean): List<Layer> {
        val runs = mutableListOf<Layer>()
        for (by in 0 until height / BLOCK) {
            var start = -1
            for (bx in 0..width / BLOCK) {
                val on = bx < width / BLOCK && inside(bx, by)
                if (on && start < 0) start = bx
                if (!on && start >= 0) {
                    val x0 = start * BLOCK
                    val x1 = bx * BLOCK
                    val y0 = by * BLOCK
                    val y1 = y0 + BLOCK
                    val corners = listOf(
                        Point(x = x0, y = y0), Point(x = x1, y = y0), Point(x = x1, y = y1), Point(x = x0, y = y1),
                    )
                    runs += Layer(mark = Area(corners), argb = argb)
                    start = -1
                }
            }
        }
        return runs
    }

    /** Somewhere around the canvas' middle. */
    private fun centre() = Vec(
        x = width / 2 + between(min = -80.0, max = 80.0),
        y = height / 2 + between(min = -50.0, max = 50.0),
    )

    private fun between(min: Double, max: Double) = min + (max - min) * random.nextDouble()
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

private fun area(points: List<Vec>, argb: Int) =
    Layer(mark = Area(points.map { Point(x = it.x.roundToInt(), y = it.y.roundToInt()) }), argb = argb)

/** A polyline as capsules, each piece's radius from its start. */
private fun line(points: List<Vec>, argb: Int, radius: (Vec) -> Int): List<Layer> = points.zipWithNext { a, b ->
    Layer(
        mark = Capsule(
            ax = a.x.roundToInt(),
            ay = a.y.roundToInt(),
            bx = b.x.roundToInt(),
            by = b.y.roundToInt(),
            radius = radius(a),
        ),
        argb = argb,
    )
}

private fun turned(v: Vec, centre: Vec, angle: Double): Vec {
    val cos = StrictMath.cos(angle)
    val sin = StrictMath.sin(angle)
    return Vec(
        x = centre.x + (v.x - centre.x) * cos - (v.y - centre.y) * sin,
        y = centre.y + (v.x - centre.x) * sin + (v.y - centre.y) * cos,
    )
}

private fun middle(a: Vec, b: Vec) = Vec(x = (a.x + b.x) / 2, y = (a.y + b.y) / 2)

private fun distance(a: Vec, b: Vec) = StrictMath.hypot(a.x - b.x, a.y - b.y)

private tailrec fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(a = b, b = a % b)

/**
 * Five colours around [baseHue] in OKLCH, where equal numbers look equally light and strong. Lightness stays
 * at most 0.75: anything lighter fades into the canvas ground.
 */
private fun analogPalette(baseHue: Double): List<String> =
    listOf(0.0 to 0.62, -12.0 to 0.74, 12.0 to 0.50, -6.0 to 0.70, 6.0 to 0.56).map { (offset, lightness) ->
        oklch(lightness = lightness, chroma = 0.16, hue = baseHue + offset)
    }

/** OKLCH → `#rrggbb`. Out of the sRGB gamut, chroma drops in steps of 0.005 until the colour fits. */
private fun oklch(lightness: Double, chroma: Double, hue: Double): String {
    val angle = Math.toRadians(hue)
    var c = chroma
    while (true) {
        val a = c * StrictMath.cos(angle)
        val b = c * StrictMath.sin(angle)
        val l = cube(lightness + 0.3963377774 * a + 0.2158037573 * b)
        val m = cube(lightness - 0.1055613458 * a - 0.0638541728 * b)
        val s = cube(lightness - 0.0894841775 * a - 1.2914855480 * b)
        val rgb = listOf(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        )
        if (rgb.all { it in 0.0..1.0 } || c <= 0.0) {
            return rgb.joinToString(separator = "", prefix = "#") { channel ->
                val encoded = gamma(channel.coerceIn(minimumValue = 0.0, maximumValue = 1.0))
                "%02x".format((255 * encoded).roundToInt())
            }
        }
        c -= 0.005
    }
}

private fun cube(x: Double) = x * x * x

/** Linear light to sRGB's transfer curve. */
private fun gamma(linear: Double) =
    if (linear <= 0.0031308) 12.92 * linear else 1.055 * StrictMath.pow(linear, 1 / 2.4) - 0.055

private fun dot(x: Int, y: Int, radius: Int, argb: Int) =
    Layer(mark = Capsule(ax = x, ay = y, bx = x, by = y, radius = radius), argb = argb)

private const val SPARKLE_RADIUS = 20
private const val STEP = 6
private const val KNOT_STEPS = 10
private const val MIN_GAP = 2
private const val BLOCK = 4
private const val FERN_SCALE = 85
private const val JULIA_ITERATIONS = 80
private const val CURVE_POINTS = 3000
private const val SPIROGRAPH_POINTS = 4000
private const val ARC_STEPS = 12
private const val SPIRAL_STEP = 0.05

private val JULIA_PARAMETERS = listOf(
    -0.8 to 0.156, -0.4 to 0.6, 0.285 to 0.01, -0.70176 to -0.3842, -0.835 to -0.2321, 0.355 to 0.355,
)
private val ROSE_RATIOS = listOf(3 to 1, 4 to 1, 5 to 1, 7 to 1, 3 to 2, 5 to 2, 5 to 3, 7 to 3, 7 to 4, 8 to 3)
private val LISSAJOUS_RATIOS = listOf(1 to 2, 1 to 3, 1 to 4, 1 to 5, 2 to 3, 2 to 5, 3 to 4, 3 to 5, 4 to 5)
    .flatMap { (a, b) -> listOf(a to b, b to a) }
private val TRUCHET_TILES = listOf(75, 100, 150)

private const val YELLOW = 0xFFEFC202.toInt()
private const val PURPLE = 0xFF841ED6.toInt()
private const val GREEN = 0xFF008000.toInt()
private const val BLUE = 0xFF2563EB.toInt()
private const val RED = 0xFFDC2626.toInt()
private const val TEAL = 0xFF0F766E.toInt()
private const val ORANGE = 0xFFEA580C.toInt()

