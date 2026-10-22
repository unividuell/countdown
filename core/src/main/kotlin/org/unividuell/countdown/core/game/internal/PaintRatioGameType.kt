package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.AssetVisibility
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.paintratio.PaintCanvas
import org.unividuell.countdown.core.paintratio.PaintRatioArtist
import org.unividuell.countdown.core.paintratio.PaintStroke
import org.unividuell.countdown.core.paintratio.Raster
import org.unividuell.countdown.core.paintratio.Shape
import org.unividuell.countdown.core.paintratio.paint
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The frozen round. Nothing in it is secret: the artwork is on show from the start, and
 * [targetCells], its painted cells counted once at draw time, is what the picture already says.
 *
 * [tolerance] is phase one's, as a share of the canvas; `null` in phase two, where there is no gate.
 */
data class PaintRatioParams(
    val shape: Shape,
    /** Paints the artwork again, stroke for stroke, when the picture is produced. */
    val artSeed: Int,
    val width: Int,
    val height: Int,
    /** Brush diameters in canvas units; a stroke names one by its index. */
    val brushes: List<Int>,
    val targetCells: Int,
    val tolerance: Double?,
)

/** What the player needs to lay out the board. The artwork comes through the round's asset endpoint. */
data class PaintRatioPayload(
    val width: Int,
    val height: Int,
    val brushes: List<Int>,
    val tolerance: Double?,
) : GamePayload

/** What the player learns about their painting: how much of the canvas it covers, and how far off that is. */
data class PaintRatioOutcome(
    val ratio: Double,
    /** Signed: positive is too much paint, negative too little. */
    val difference: Double,
    /** `null` in phase two, because there is no gate to be inside of. */
    val withinTolerance: Boolean?,
) : GameOutcome

/** The share the artwork covers and, in phase one, how far around it counted. */
data class PaintRatioSolution(val targetRatio: Double, val tolerance: Double?) : GameSolution

/**
 * Kreativverhältnis as an announceable game; `paintratio` knows nothing about it.
 *
 * Everything is drawn from the presentation stream: the artwork is visible at once and the target
 * share follows from it, so there is no secret for another stream to guard. The draw order — shape,
 * then one `artSeed` per attempt — is part of the round's identity.
 *
 * The ceiling: the solution is in the picture, so a script can count its pixels and send strokes of
 * exactly that share — accepted, as for Musterung.
 */
@Component
class PaintRatioGameType(private val mapper: ObjectMapper) : GameType<PaintRatioParams> {

    override val id = "paint-ratio"
    override val displayName = "Kreativverhältnis"
    override val paramsType = PaintRatioParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): PaintRatioParams {
        val used = context.previousParams.map { mapper.treeToValue(it, PaintRatioParams::class.java).shape }.toSet()
        // Ten shapes must not starve: once each has had its round, all count again.
        val shape = random.presentation.pick(Shape.entries.filterNot { it in used }.ifEmpty { Shape.entries })
        val width = PaintCanvas.WIDTH
        val height = PaintCanvas.HEIGHT

        // From twice the tolerance on, a single dab can no longer hit in phase one.
        val smallest = cellsOf(share = 2 * shape.tolerance, width = width, height = height)

        repeat(MAX_DRAWS) {
            val artSeed = random.presentation.nextInt(Int.MAX_VALUE)
            val cells = raster(
                shape = shape, artSeed = artSeed, width = width, height = height, brushes = PaintCanvas.BRUSHES,
            ).cells()

            if (cells >= smallest) {
                return PaintRatioParams(
                    shape = shape,
                    artSeed = artSeed,
                    width = width,
                    height = height,
                    brushes = PaintCanvas.BRUSHES,
                    targetCells = cells,
                    tolerance = when (context.phase) {
                        Phase.ONE -> shape.tolerance
                        Phase.TWO -> null
                    },
                )
            }
        }

        error("no $shape artwork of at least $smallest cells in $MAX_DRAWS draws")
    }

    override fun present(params: PaintRatioParams) = PaintRatioPayload(
        width = params.width,
        height = params.height,
        brushes = params.brushes,
        tolerance = params.tolerance,
    )

    /** Never, in either phase: as in Farbausmalung, the clock is statistics rather than stake. */
    override fun requiresReveal(params: PaintRatioParams) = false

    override fun scoresOnDuration(params: PaintRatioParams) = false

    override fun judge(params: PaintRatioParams, guess: JsonNode): Judgement {
        val strokes = strokesOf(guess = guess, brushCount = params.brushes.size)
        val cells = Raster(width = params.width, height = params.height)
            .also { it.paint(strokes = strokes, brushes = params.brushes) }
            .cells()

        val area = params.width * params.height
        val missed = cells - params.targetCells
        // Whole cells, so that no floating-point edge decides a hit.
        val within = params.tolerance?.let {
            abs(missed) <= cellsOf(share = it, width = params.width, height = params.height)
        }
        val difference = missed.toDouble() / area

        return Judgement(
            // No gate in phase two: everybody is a candidate, and CLOSEST_ONLY picks the winner.
            qualifies = within ?: true,
            deviation = abs(difference),
            guess = mapper.valueToTree(mapOf("strokes" to strokes)),
            outcome = PaintRatioOutcome(
                ratio = cells.toDouble() / area,
                difference = difference,
                withinTolerance = within,
            ),
        )
    }

    override fun solution(params: PaintRatioParams) = PaintRatioSolution(
        targetRatio = params.targetCells.toDouble() / (params.width * params.height),
        tolerance = params.tolerance,
    )

    /**
     * The picture is the raster that was counted. A painter that changed since the draw fails the
     * materialisation here, loudly, instead of showing a picture that is not what is measured.
     */
    override fun produceAssets(params: PaintRatioParams): List<RoundAsset> {
        val raster = raster(
            shape = params.shape,
            artSeed = params.artSeed,
            width = params.width,
            height = params.height,
            brushes = params.brushes,
        )
        val cells = raster.cells()

        check(cells == params.targetCells) {
            "${params.shape} of seed ${params.artSeed} paints $cells cells, the round froze ${params.targetCells}"
        }

        return listOf(
            RoundAsset(
                name = "target",
                visibility = AssetVisibility.FromStage(0),
                mediaType = "image/png",
                bytes = raster.png(),
            ),
        )
    }

    private fun raster(shape: Shape, artSeed: Int, width: Int, height: Int, brushes: List<Int>) =
        PaintRatioArtist.paint(shape = shape, artSeed = artSeed, width = width, height = height, brushes = brushes)
            .raster(width = width, height = height)

    private fun cellsOf(share: Double, width: Int, height: Int) = (share * width * height).roundToInt()

    private fun strokesOf(guess: JsonNode, brushCount: Int): List<PaintStroke> {
        val nodes = guess.takeIf { it.hasExactly("strokes") }
            ?.get("strokes")
            ?.takeIf { it.isArray && it.size() <= MAX_STROKES }
            ?: throw InvalidGuessException("guess must carry 'strokes' only, an array of at most $MAX_STROKES strokes")

        var points = 0
        var path = 0L

        return nodes.mapIndexed { index, node ->
            val stroke = strokeOf(node = node, index = index, brushCount = brushCount)

            points += stroke.points.size / 2
            path += pathLength(stroke.points)
            if (points > MAX_POINTS) throw InvalidGuessException("strokes must carry at most $MAX_POINTS points")
            if (path > MAX_PATH) throw InvalidGuessException("strokes must not cover more than $MAX_PATH units")

            stroke
        }
    }

    private fun strokeOf(node: JsonNode, index: Int, brushCount: Int): PaintStroke {
        if (!node.hasExactly("brush", "color", "points")) {
            throw InvalidGuessException("strokes[$index] must carry 'brush', 'color' and 'points' only")
        }

        val brush = integerOf(node.get("brush"))
            ?.takeIf { it in 0 until brushCount }
            ?: throw InvalidGuessException("strokes[$index].brush must be an integral index in [0, $brushCount)")
        val color = node.get("color")
            ?.takeIf { it.isString }
            ?.stringValue()
            ?.takeIf { COLOR.matches(it) }
            ?: throw InvalidGuessException("strokes[$index].color must be '#rrggbb' in lower case")
        // The size is checked before any value is read: a huge array costs a comparison, not a loop.
        val values = node.get("points")
            ?.takeIf { it.isArray && it.size() in 2..2 * MAX_POINTS && it.size() % 2 == 0 }
            ?: throw InvalidGuessException("strokes[$index].points must hold an even number of values, 2 at least")

        val points = values.mapIndexed { i, value ->
            integerOf(value)
                ?.takeIf { it in -COORDINATE_LIMIT..COORDINATE_LIMIT }
                ?: throw InvalidGuessException(
                    "strokes[$index].points[$i] must be an integral number in [-$COORDINATE_LIMIT, $COORDINATE_LIMIT]",
                )
        }

        return PaintStroke(brush = brush, color = color, points = points)
    }

    // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
    private fun integerOf(node: JsonNode?): Int? = node?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.asInt()

    private fun JsonNode.hasExactly(vararg fields: String) = isObject && propertyNames().toSet() == fields.toSet()

    /** `Long`: 100 000 jumps of up to 40 000 units overflow an `Int`. */
    private fun pathLength(points: List<Int>): Long = (0 until points.size - 2 step 2).sumOf { i ->
        abs(points[i + 2] - points[i]).toLong() + abs(points[i + 3] - points[i + 1])
    }

    companion object {
        /** The wire's limits: guards against abuse, not against painting. A point is an x, y pair. */
        const val MAX_STROKES = 5_000
        const val MAX_POINTS = 100_000
        const val COORDINATE_LIMIT = 10_000

        /**
         * Σ(|dx| + |dy|) over all segments of all strokes. Counting costs the rows a segment crosses,
         * not its points: 100 000 jumps from corner to corner took 2.8 s, under this cap it stays far
         * below a second.
         */
        const val MAX_PATH = 3_000_000

        /** Attempts at an artwork big enough for its shape's tolerance. */
        const val MAX_DRAWS = 100

        private val COLOR = Regex("#[0-9a-f]{6}")
    }
}
