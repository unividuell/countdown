package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.assertions.withClue
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.longs.shouldBeGreaterThan
import io.kotest.matchers.longs.shouldBeLessThan
import io.kotest.matchers.longs.shouldBeLessThanOrEqual
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.PaintRatioGameType
import org.unividuell.countdown.core.game.internal.PaintRatioOutcome
import org.unividuell.countdown.core.game.internal.PaintRatioParams
import org.unividuell.countdown.core.game.internal.PaintRatioSolution
import org.unividuell.countdown.core.paintratio.PaintCanvas
import org.unividuell.countdown.core.paintratio.PaintRatioArtist
import org.unividuell.countdown.core.paintratio.PaintStroke
import org.unividuell.countdown.core.paintratio.Raster
import org.unividuell.countdown.core.paintratio.Shape
import org.unividuell.countdown.core.paintratio.paint
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.time.measureTime

class PaintRatioGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val mapper = JsonMapper.builder().build()
    private val game = PaintRatioGameType(mapper = mapper)

    private val width = PaintCanvas.WIDTH
    private val height = PaintCanvas.HEIGHT
    private val area = width * height

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(previous: List<PaintRatioParams> = emptyList(), phase: Phase = Phase.ONE) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun params(shape: Shape = Shape.CIRCLE, targetCells: Int = 100_000, tolerance: Double? = 0.01) =
        PaintRatioParams(
            shape = shape,
            artSeed = 1,
            width = width,
            height = height,
            brushes = PaintCanvas.BRUSHES,
            targetCells = targetCells,
            tolerance = tolerance,
        )

    private fun tree(value: Any?): JsonNode = mapper.readTree(mapper.writeValueAsString(value))

    private fun guess(json: String) = mapper.readTree(json)

    private fun guessOf(strokes: List<PaintStroke>): JsonNode = mapper.valueToTree(mapOf("strokes" to strokes))

    private fun cellsOf(strokes: List<PaintStroke>) = Raster(width = width, height = height)
        .also { it.paint(strokes = strokes, brushes = PaintCanvas.BRUSHES) }
        .cells()

    private val dot = """{"strokes":[{"brush":0,"color":"#3049e8","points":[600,450]}]}"""

    /** Σ(|dx| + |dy|) over the consecutive pairs of a flat `[x0, y0, x1, y1, …]`. */
    private fun pathLength(points: List<Int>) = (0 until points.size - 2 step 2).sumOf { i ->
        abs(points[i + 2] - points[i]).toLong() + abs(points[i + 3] - points[i + 1])
    }

    private fun stroke(points: List<Int>) = PaintStroke(brush = 0, color = "#3049e8", points = points)

    /** `segments` pieces along the canvas' top edge, each exactly the canvas' width long. */
    private fun sweep(segments: Int) = (0..segments).flatMap { i -> listOf(if (i % 2 == 0) 0 else width, 10) }

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "paint-ratio"
        game.displayName shouldBe "Anmaßung"
    }

    @Test
    fun `everything follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)) shouldBe
            draw(random = random(presentation = 2))
    }

    @Test
    fun `the shape skips those this edition had and falls back to all`() {
        val nineUsed = Shape.entries.take(9)
        val previous = nineUsed.map { params(shape = it) }

        (1..20).forEach { seed ->
            draw(random = random(presentation = seed), context = context(previous = previous)).shape shouldBe
                Shape.entries.last()
        }

        val allUsed = Shape.entries.map { params(shape = it) }
        val shapes = (1..100).map { seed ->
            draw(random = random(presentation = seed), context = context(previous = allUsed)).shape
        }
        shapes.toSet() shouldBe Shape.entries.toSet()
    }

    @Test
    fun `phase one freezes the shape's tolerance, phase two none`() {
        val one = draw(context = context(phase = Phase.ONE))
        val two = draw(context = context(phase = Phase.TWO))

        one.tolerance shouldBe one.shape.tolerance
        two.tolerance.shouldBeNull()
    }

    @Test
    fun `a round freezes the canvas and its brushes`() {
        val drawn = draw()

        drawn.width shouldBe 1200
        drawn.height shouldBe 900
        drawn.brushes shouldBe listOf(40, 80, 160)
    }

    @Test
    fun `no artwork is smaller than twice its shape's tolerance, in either phase`() {
        for (phase in Phase.entries) {
            for (seed in 1..60) {
                val drawn = draw(random = random(presentation = seed), context = context(phase = phase))

                withClue("$phase, seed $seed, ${drawn.shape}") {
                    drawn.targetCells shouldBeGreaterThanOrEqual
                        (2 * drawn.shape.tolerance * width * height).roundToInt()
                }
            }
        }
    }

    @Test
    fun `a first artwork below the minimum is redrawn from the same stream`() {
        fun cellsOf(shape: Shape, artSeed: Int) = PaintRatioArtist
            .paint(shape = shape, artSeed = artSeed, width = width, height = height, brushes = PaintCanvas.BRUSHES)
            .raster(width = width, height = height)
            .cells()
        fun smallest(shape: Shape) = (2 * shape.tolerance * area).roundToInt()

        // The first candidate of a presentation seed: the shape, then one art seed per attempt.
        fun firstCandidateIsTooSmall(seed: Int): Boolean {
            val replay = SeededRandom.fromSeed(seed)
            val shape = replay.pick(Shape.entries)

            return cellsOf(shape = shape, artSeed = replay.nextInt(Int.MAX_VALUE)) < smallest(shape)
        }
        val seed = (1..1_000).first { firstCandidateIsTooSmall(it) }

        val replay = SeededRandom.fromSeed(seed)
        val shape = replay.pick(Shape.entries)
        val first = replay.nextInt(Int.MAX_VALUE)
        val accepted = generateSequence { replay.nextInt(Int.MAX_VALUE) }
            .first { cellsOf(shape = shape, artSeed = it) >= smallest(shape) }

        val drawn = draw(random = random(presentation = seed))

        drawn.shape shouldBe shape
        drawn.artSeed shouldBe accepted
        drawn.artSeed shouldNotBe first
        draw(random = random(presentation = seed)) shouldBe drawn
    }

    @Test
    fun `the image is exactly the counted raster`() {
        val drawn = draw()

        val asset = game.produceAssets(drawn).single()
        val image = ImageIO.read(ByteArrayInputStream(asset.bytes))

        asset.name shouldBe "target"
        asset.visibility shouldBe AssetVisibility.FromStage(0)
        asset.mediaType shouldBe "image/png"
        image.width shouldBe width
        image.height shouldBe height
        (0 until height).sumOf { y -> (0 until width).count { x -> image.getRGB(x, y) ushr 24 != 0 } } shouldBe
            drawn.targetCells
    }

    @Test
    fun `a changed painter fails the materialisation loudly`() {
        val drawn = draw()

        shouldThrow<IllegalStateException> { game.produceAssets(drawn.copy(targetCells = drawn.targetCells + 1)) }
    }

    @Test
    fun `the payload carries width, height, brushes and tolerance`() {
        tree(game.present(draw())).propertyNames().toSet() shouldBe setOf("width", "height", "brushes", "tolerance")
    }

    @Test
    fun `the solution carries targetRatio and tolerance`() {
        val solution = game.solution(params(targetCells = 270_000))

        solution.shouldBeInstanceOf<PaintRatioSolution>().targetRatio shouldBe 0.25
        tree(solution).propertyNames().toSet() shouldBe setOf("targetRatio", "tolerance")
    }

    @Test
    fun `the outcome carries ratio, difference and withinTolerance`() {
        val outcome = game.judge(params = params(), guess = guess(dot)).outcome

        tree(outcome).propertyNames().toSet() shouldBe setOf("ratio", "difference", "withinTolerance")
    }

    @Test
    fun `it never asks for a reveal and never scores on time`() {
        for (phase in Phase.entries) {
            val drawn = draw(context = context(phase = phase))

            game.requiresReveal(drawn) shouldBe false
            game.scoresOnDuration(drawn) shouldBe false
        }
    }

    @Test
    fun `a guess exactly at the tolerance hits, one cell further misses`() {
        val cells = cellsOf(listOf(PaintStroke(brush = 0, color = "#3049e8", points = listOf(600, 450))))
        val tolerance = 0.01
        val toleranceCells = 10_800
        val atEdge = params(targetCells = cells + toleranceCells, tolerance = tolerance)
        val beyond = params(targetCells = cells + toleranceCells + 1, tolerance = tolerance)

        game.judge(params = atEdge, guess = guess(dot)).qualifies shouldBe true
        game.judge(params = beyond, guess = guess(dot)).qualifies shouldBe false
        game.judge(params = beyond.copy(tolerance = null), guess = guess(dot)).qualifies shouldBe true
    }

    @Test
    fun `the outcome is the ratio and the signed difference`() {
        val cells = cellsOf(listOf(PaintStroke(brush = 0, color = "#3049e8", points = listOf(600, 450))))
        val over = params(targetCells = cells - 5_400)
        val under = params(targetCells = cells + 5_400, tolerance = null)

        val tooMuch = game.judge(params = over, guess = guess(dot))
        val tooLittle = game.judge(params = under, guess = guess(dot))

        tooMuch.outcome.shouldBeInstanceOf<PaintRatioOutcome>().let {
            it.ratio shouldBe (cells.toDouble() / area)
            it.difference shouldBe (5_400.0 / area plusOrMinus 1e-12)
            it.withinTolerance shouldBe true
        }
        tooMuch.deviation shouldBe (5_400.0 / area plusOrMinus 1e-12)
        tooLittle.outcome.shouldBeInstanceOf<PaintRatioOutcome>().let {
            it.difference shouldBe (-5_400.0 / area plusOrMinus 1e-12)
            it.withinTolerance.shouldBeNull()
        }
        tooLittle.deviation shouldBe (5_400.0 / area plusOrMinus 1e-12)
        tooLittle.qualifies shouldBe true
    }

    @Test
    fun `an empty painting is valid and has ratio 0`() {
        val judgement = game.judge(params = params(), guess = guess("""{"strokes":[]}"""))

        judgement.outcome.shouldBeInstanceOf<PaintRatioOutcome>().ratio shouldBe 0.0
    }

    @Test
    fun `the stored guess is rebuilt from the checked fields`() {
        val json = """
            {"strokes":[
              {"brush":2,"color":"#3049e8","points":[1,2,3,4]},
              {"brush":0,"color":"#000000","points":[9,9]}
            ]}
        """.trimIndent()

        game.judge(params = params(), guess = guess(json)).guess.shouldNotBeNull() shouldBe guess(json)
    }

    @Test
    fun `the wire's limits are valid guesses`() {
        val corners = """{"strokes":[{"brush":0,"color":"#3049e8","points":[-10000,10000,10000,-10000]}]}"""
        val manyStrokes = List(5_000) { stroke(listOf(it % width, 5)) }

        shouldNotThrowAny {
            game.judge(params = params(), guess = guess(corners))
            game.judge(params = params(), guess = guessOf(manyStrokes))
            pathLength(sweep(segments = 2_500)) shouldBe PaintRatioGameType.MAX_PATH.toLong()
            game.judge(params = params(), guess = guessOf(listOf(stroke(sweep(segments = 2_500)))))
            game.judge(params = params(), guess = guessOf(List(2) { stroke(sweep(segments = 1_250)) }))
        }
    }

    @Test
    fun `a malformed guess is refused before anything is written`() {
        val tooManyStrokes = List(5_001) { stroke(listOf(1, 1)) }
        val tooManyPoints = listOf(stroke(List(200_002) { 1 }))
        val tooManyPointsOverTwoStrokes = listOf(stroke(List(100_000) { 1 }), stroke(List(100_002) { 1 }))
        val oneStrokeTooLong = listOf(stroke(sweep(segments = 2_500) + listOf(1, 10)))
        val twoStrokesTooLong = listOf(stroke(sweep(segments = 1_250)), stroke(sweep(segments = 1_250) + listOf(1, 10)))
        listOf(
            """{}""",
            """[]""",
            """{"strokes":{}}""",
            """{"strokes":"none"}""",
            """{"strokes":null}""",
            """{"strokes":[],"note":"hi"}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[1,2],"note":"hi"}]}""",
            """{"strokes":[{"color":"#3049e8","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8"}]}""",
            """{"strokes":[{"brush":3,"color":"#3049e8","points":[1,2]}]}""",
            """{"strokes":[{"brush":-1,"color":"#3049e8","points":[1,2]}]}""",
            """{"strokes":[{"brush":"0","color":"#3049e8","points":[1,2]}]}""",
            """{"strokes":[{"brush":0.5,"color":"#3049e8","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049E8","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"red","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#12345","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8\n","points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":5,"points":[1,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[1,2,3]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":"1,2"}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[10001,0]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[-10001,0]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[0,10001]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[0,-10001]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[1.5,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":["1",2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[1099511627776,2]}]}""",
            """{"strokes":[{"brush":0,"color":"#3049e8","points":[1,2]},5]}""",
        ).forEach { json ->
            withClue(json) { shouldThrow<InvalidGuessException> { game.judge(params = params(), guess = guess(json)) } }
        }

        withClue("5 001 strokes") {
            shouldThrow<InvalidGuessException> { game.judge(params = params(), guess = guessOf(tooManyStrokes)) }
        }
        withClue("100 001 points") {
            shouldThrow<InvalidGuessException> { game.judge(params = params(), guess = guessOf(tooManyPoints)) }
        }
        withClue("100 001 points over two strokes") {
            shouldThrow<InvalidGuessException> {
                game.judge(params = params(), guess = guessOf(tooManyPointsOverTwoStrokes))
            }
        }
        withClue("a path of MAX_PATH + 1 in one stroke") {
            pathLength(oneStrokeTooLong.single().points) shouldBe PaintRatioGameType.MAX_PATH + 1L
            shouldThrow<InvalidGuessException> { game.judge(params = params(), guess = guessOf(oneStrokeTooLong)) }
        }
        withClue("a path of MAX_PATH + 1 over two strokes") {
            twoStrokesTooLong.sumOf { pathLength(it.points) } shouldBe PaintRatioGameType.MAX_PATH + 1L
            shouldThrow<InvalidGuessException> { game.judge(params = params(), guess = guessOf(twoStrokesTooLong)) }
        }
    }

    @Test
    fun `the largest guess counts in under a second`() {
        // Rows painted grow with Σ(160 + |dy|): a vertical zig-zag of 30 units a step, 100 000 points on
        // the canvas, spends nearly all of MAX_PATH where the cost is highest.
        val points = (0 until 100_000).flatMap { i ->
            val run = i % (2 * width)
            listOf(if (run < width) run else 2 * width - run, 100 + (i % 2) * 29)
        }
        val path = pathLength(points)
        val strokes = listOf(PaintStroke(brush = 2, color = "#3049e8", points = points))
        val largest = guessOf(strokes)

        path shouldBeLessThanOrEqual PaintRatioGameType.MAX_PATH.toLong()
        path shouldBeGreaterThan 2_900_000L

        game.judge(params = params(), guess = largest)
        // The best of three: one slow run on a busy CI runner says nothing about the cost.
        val elapsed = (1..3).minOf { measureTime { game.judge(params = params(), guess = largest) } }

        elapsed.inWholeMilliseconds shouldBeLessThan 1000L
    }
}
