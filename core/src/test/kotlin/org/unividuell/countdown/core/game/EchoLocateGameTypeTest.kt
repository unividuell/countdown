package org.unividuell.countdown.core.game

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.doubles.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.unividuell.countdown.core.echolocate.Cell
import org.unividuell.countdown.core.echolocate.EchoHit
import org.unividuell.countdown.core.echolocate.EchoLocateClips
import org.unividuell.countdown.core.echolocate.FieldLayout
import org.unividuell.countdown.core.echolocate.Layout
import org.unividuell.countdown.core.echolocate.NoiseKind
import org.unividuell.countdown.core.echolocate.NoiseSource
import org.unividuell.countdown.core.echolocate.Sound
import org.unividuell.countdown.core.echolocate.echoOf
import org.unividuell.countdown.core.echolocate.pcmWav
import org.unividuell.countdown.core.game.internal.EchoLocateEcho
import org.unividuell.countdown.core.game.internal.EchoLocateGameType
import org.unividuell.countdown.core.game.internal.EchoLocateOutcome
import org.unividuell.countdown.core.game.internal.EchoLocateParams
import org.unividuell.countdown.core.game.internal.EchoLocateSolution
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class EchoLocateGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val clipA = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val clipB = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val clipC = UUID.fromString("0190f1b2-0000-7000-8000-0000000000c1")
    private val all = listOf(clipA, clipB, clipC)

    private val wavs = all.mapIndexed { i, id ->
        id to pcmWav(interleaved = ShortArray(80) { (i + 1).toShort() }, channels = 1, sampleRate = 8_000)
    }.toMap()

    private val mapper = JsonMapper.builder().build()
    private val clips = mockk<EchoLocateClips> {
        every { playable(community) } returns all
        every { prepared(any()) } answers { wavs.getValue(firstArg()) }
    }
    private val game = EchoLocateGameType(clips = clips, mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(
        previous: List<EchoLocateParams> = emptyList(),
        phase: Phase = Phase.ONE,
        difficulty: Double = 0.0,
    ) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
        difficulty = difficulty,
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    private fun json(text: String): JsonNode = mapper.readTree(text)

    /** A round with its secret set by hand, so a pin's verdict can be worked out on paper. */
    private fun roundOf(vararg targets: Cell, phase: Phase = Phase.ONE) =
        draw(context = context(phase = phase, difficulty = 1.0)).let {
            it.copy(
                clipIds = all.take(targets.size),
                targets = targets.toList(),
                noises = emptyList(),
                toleranceCells = if (phase == Phase.ONE) 1 else null,
            )
        }

    private fun judge(params: EchoLocateParams, guess: String) = game.judge(params = params, guess = json(guess))

    private fun pins(vararg pins: Pair<Double, Double>) =
        """{"pins":[${pins.joinToString(",") { """{"x":${it.first},"y":${it.second}}""" }}],"rings":[]}"""

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "echo-locate"
        game.displayName shouldBe "Peilung"
    }

    @Test
    fun `difficulty 0 draws one clip, 1 draws two`() {
        (1..30).forEach { seed ->
            draw(random = random(scene = seed), context = context(difficulty = 0.0)).clipIds shouldHaveSize 1
            draw(random = random(scene = seed), context = context(difficulty = 1.0)).clipIds shouldHaveSize 2
        }
    }

    @Test
    fun `a single playable clip draws one, whatever the difficulty`() {
        every { clips.playable(community) } returns listOf(clipA)

        (1..10).forEach { seed ->
            draw(random = random(scene = seed), context = context(difficulty = 1.0)).clipIds shouldBe listOf(clipA)
        }
    }

    @Test
    fun `two clips are different`() {
        (1..40).forEach { seed ->
            draw(random = random(scene = seed), context = context(difficulty = 1.0)).clipIds.toSet() shouldHaveSize 2
        }
    }

    @Test
    fun `clips this edition had are skipped, then filled up from all`() {
        val earlier = listOf(
            draw().copy(clipIds = listOf(clipA, clipB)),
        )

        (1..20).forEach { seed ->
            val two = draw(random = random(scene = seed), context = context(previous = earlier, difficulty = 1.0))
            two.clipIds shouldContain clipC
            two.clipIds.toSet() shouldHaveSize 2

            draw(random = random(scene = seed), context = context(previous = earlier)).clipIds shouldBe listOf(clipC)
        }

        // Every clip has had its round: all count again.
        val used = listOf(draw().copy(clipIds = all))
        (1..20).map { draw(random = random(scene = it), context = context(previous = used)).clipIds.single() }
            .toSet() shouldBe all.toSet()
    }

    @Test
    fun `count and clips follow the scene seed only`() {
        listOf(0.0, 0.5, 1.0).forEach { difficulty ->
            (1..40).forEach { seed ->
                // The reference: the count from the first double, then the clips from the same stream.
                val reference = SeededRandom.fromSeed(seed)
                val count = if (reference.nextDouble() < difficulty) 2 else 1
                val expected = reference.sample(items = all, k = count)

                draw(
                    random = random(solution = 9, presentation = 9, scene = seed),
                    context = context(difficulty = difficulty),
                ).clipIds shouldBe expected
            }
        }

        (1..40).map { draw(random = random(scene = it), context = context(difficulty = 0.5)).clipIds.size }
            .toSet() shouldBe setOf(1, 2)
    }

    @Test
    fun `positions follow the solution seed only`() {
        (1..20).forEach { seed ->
            val a = draw(random = random(solution = seed), context = context(difficulty = 1.0))
            val b = draw(
                random = random(solution = seed, presentation = 77, scene = 3),
                context = context(difficulty = 1.0),
            )

            b.targets shouldBe a.targets
            b.noises shouldBe a.noises
            // Targets first, then the noise, from one stream.
            FieldLayout.place(random = SeededRandom.fromSeed(seed), grid = 20, clips = 2, noises = 6) shouldBe
                Layout(targets = a.targets, noises = a.noises)
        }

        (1..20).map { draw(random = random(solution = it)).targets }.toSet().size shouldBeGreaterThan 1
    }

    @Test
    fun `it leaves the presentation stream untouched`() {
        val used = random(presentation = 2)
        draw(random = used, context = context(difficulty = 1.0))

        used.presentation.nextUint32() shouldBe random(presentation = 2).presentation.nextUint32()
    }

    @Test
    fun `the field, the wave and the sound are frozen with the round`() {
        val params = draw()

        params.grid shouldBe 20
        params.reach shouldBe 12.0
        params.speed shouldBe 3.0
        params.pings shouldBe 3
        params.bedDb shouldBe -24.0
        params.noiseDb shouldBe 0.0
        params.noises.map { it.kind } shouldContainExactly listOf(
            NoiseKind.BIRDS, NoiseKind.BROOK, NoiseKind.COW, NoiseKind.WIND, NoiseKind.RAIN, NoiseKind.BIRDS,
        )
    }

    @Test
    fun `phase one freezes a tolerance of one cell, phase two none`() {
        draw(context = context(phase = Phase.ONE)).toleranceCells shouldBe 1
        draw(context = context(phase = Phase.TWO)).toleranceCells.shouldBeNull()
    }

    @Test
    fun `it is not available without a playable clip`() {
        game.isAvailable(context()) shouldBe true

        every { clips.playable(community) } returns emptyList()

        game.isAvailable(context()) shouldBe false
    }

    @Test
    fun `it never asks for a reveal or scores on time, and its stages only count pings`() {
        listOf(Phase.ONE, Phase.TWO).forEach { phase ->
            val params = draw(context = context(phase = phase))

            game.requiresReveal(params) shouldBe false
            game.scoresOnDuration(params) shouldBe false
            game.stages(params) shouldBe 4
            game.stagesScore(params) shouldBe false
        }
    }

    @Test
    fun `payload, step answer, solution and outcome carry exactly their fields`() {
        val params = draw(context = context(difficulty = 1.0))
        val target = params.targets[0]
        val ping = game.step(
            params = params,
            stage = 0,
            input = json("""{"x":${target.col + 0.5},"y":${target.row + 0.5}}"""),
        )

        fields(game.present(params)) shouldBe
            setOf("grid", "reach", "speed", "pings", "clips", "bedDb", "noiseDb", "toleranceCells")

        fields(ping) shouldBe setOf("hits")
        (ping as EchoLocateEcho).hits.map { it.sound } shouldContain Sound.CLIP
        fields(ping.hits.first { it.sound == Sound.CLIP }) shouldBe setOf("sound", "clip", "delayMs")

        fields(game.solution(params)) shouldBe setOf("targets", "noises", "toleranceCells")
        fields(judge(params = params, guess = pins(1.0 to 1.0, 9.0 to 9.0)).outcome) shouldBe
            setOf("distance", "withinTolerance", "pinOf")
    }

    @Test
    fun `the payload tells the field and the count, never a position`() {
        val params = draw(context = context(difficulty = 1.0))

        mapper.valueToTree<JsonNode>(game.present(params)) shouldBe json(
            """
            {"grid":20,"reach":12.0,"speed":3.0,"pings":3,"clips":2,"bedDb":-24.0,"noiseDb":0.0,"toleranceCells":1}
            """.trimIndent(),
        )
    }

    @Test
    fun `the solution is the frozen secret`() {
        val params = draw()

        game.solution(params) shouldBe EchoLocateSolution(
            targets = params.targets,
            noises = params.noises,
            toleranceCells = 1,
        )
    }

    @Test
    fun `a ping answers with the echo of every source in reach`() {
        val params = draw(context = context(difficulty = 1.0))

        game.step(params = params, stage = 1, input = json("""{"x":7.31,"y":12.08}""")) shouldBe EchoLocateEcho(
            hits = echoOf(
                x = 7.31,
                y = 12.08,
                layout = Layout(targets = params.targets, noises = params.noises),
                reach = 12.0,
                speed = 3.0,
            ),
        )
    }

    @Test
    fun `a ping hears what is in reach after distance over speed, and nothing else`() {
        val params = roundOf(Cell(col = 10, row = 10))
            .copy(noises = listOf(NoiseSource(cell = Cell(col = 10, row = 0), kind = NoiseKind.COW)))

        // On the clip's centre: heard at once, the cow 10 cells up after 3.3 s.
        game.step(params = params, stage = 0, input = json("""{"x":10.5,"y":10.5}""")) shouldBe EchoLocateEcho(
            hits = listOf(
                EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 0),
                EchoHit(sound = Sound.COW, clip = null, delayMs = 3333),
            ),
        )
        // 9 cells from the clip, 13.45 from the cow: the cow is out of reach.
        game.step(params = params, stage = 0, input = json("""{"x":19.5,"y":10.5}""")) shouldBe EchoLocateEcho(
            hits = listOf(EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 3000)),
        )
        game.step(params = params, stage = 0, input = json("""{"x":0.0,"y":20.0}""")) shouldBe
            EchoLocateEcho(hits = emptyList())
    }

    @Test
    fun `the corners of the field are valid pings`() {
        val params = draw()

        game.step(params = params, stage = 0, input = json("""{"x":0,"y":0}""")).shouldNotBeNull()
        game.step(params = params, stage = 0, input = json("""{"x":20,"y":20.0}""")).shouldNotBeNull()
    }

    @Test
    fun `a malformed ping is refused`() {
        val params = draw()

        shouldThrow<InvalidStepException> { game.step(params = params, stage = 0, input = null) }

        listOf(
            "{}",
            """{"x":1}""",
            """{"y":1}""",
            """{"x":"1","y":1}""",
            """{"x":1,"y":null}""",
            """{"x":-0.1,"y":1}""",
            """{"x":1,"y":-0.1}""",
            """{"x":20.1,"y":1}""",
            """{"x":1,"y":20.1}""",
            """{"x":1e999,"y":1}""",
            """{"x":1,"y":1,"z":0}""",
            """[1,2]""",
            """null""",
            """5""",
        ).forEach { text ->
            shouldThrow<InvalidStepException> { game.step(params = params, stage = 0, input = json(text)) }
        }
    }

    @Test
    fun `one clip - a pin in the 3 by 3 block hits, the next cell misses`() {
        val params = roundOf(Cell(col = 5, row = 5))

        // The block spans columns and rows 4..6, i.e. coordinates [4, 7).
        listOf(4.0 to 4.0, 6.99 to 6.99, 5.5 to 5.5, 4.0 to 6.99).forEach { (x, y) ->
            judge(params = params, guess = pins(x to y)).qualifies shouldBe true
        }
        listOf(3.99 to 5.5, 7.0 to 5.5, 5.5 to 3.99, 5.5 to 7.0, 7.0 to 7.0).forEach { (x, y) ->
            judge(params = params, guess = pins(x to y)).qualifies shouldBe false
        }
    }

    @Test
    fun `a pin on the far edge belongs to the last cell`() {
        val params = roundOf(Cell(col = 18, row = 18))

        // Cell 20 does not exist: x = 20 is cell 19, one off the target — a 21st cell would be two.
        val edge = judge(params = params, guess = pins(20.0 to 20.0))

        edge.qualifies shouldBe true
        (edge.outcome as EchoLocateOutcome).withinTolerance shouldBe true
        edge.deviation shouldBe (2.1213203435596424 plusOrMinus 1e-9)
    }

    @Test
    fun `two clips - both pins in their blocks hit, one alone does not`() {
        val params = roundOf(Cell(col = 3, row = 3), Cell(col = 15, row = 15))

        judge(params = params, guess = pins(3.5 to 3.5, 15.5 to 15.5)).qualifies shouldBe true
        judge(params = params, guess = pins(2.0 to 4.99, 16.99 to 14.0)).qualifies shouldBe true
        judge(params = params, guess = pins(3.5 to 3.5, 10.0 to 10.0)).qualifies shouldBe false
        judge(params = params, guess = pins(10.0 to 10.0, 15.5 to 15.5)).qualifies shouldBe false
        judge(params = params, guess = pins(3.5 to 3.5, 17.0 to 15.5)).qualifies shouldBe false
    }

    @Test
    fun `two clips in either pin order give the same verdict and pinOf`() {
        val params = roundOf(Cell(col = 3, row = 3), Cell(col = 15, row = 15))

        val forward = judge(params = params, guess = pins(3.5 to 4.0, 15.0 to 15.5))
        val swapped = judge(params = params, guess = pins(15.0 to 15.5, 3.5 to 4.0))

        forward.qualifies shouldBe true
        swapped.qualifies shouldBe true
        forward.deviation shouldBe swapped.deviation
        (forward.outcome as EchoLocateOutcome).pinOf shouldBe listOf(0, 1)
        (swapped.outcome as EchoLocateOutcome).pinOf shouldBe listOf(1, 0)
        swapped.outcome.distance shouldBe forward.outcome.distance
    }

    @Test
    fun `the deviation is the mean distance to the cell centres`() {
        // 3-4-5 from the centre (5.5, 5.5), and 1 from the centre (15.5, 15.5).
        val one = judge(params = roundOf(Cell(col = 5, row = 5)), guess = pins(8.5 to 9.5))
        one.deviation shouldBe (5.0 plusOrMinus 1e-9)
        (one.outcome as EchoLocateOutcome).distance shouldBe (5.0 plusOrMinus 1e-9)

        val two = judge(
            params = roundOf(Cell(col = 5, row = 5), Cell(col = 15, row = 15)),
            guess = pins(8.5 to 9.5, 16.5 to 15.5),
        )
        two.deviation shouldBe (3.0 plusOrMinus 1e-9)
        (two.outcome as EchoLocateOutcome).distance shouldBe (3.0 plusOrMinus 1e-9)
    }

    @Test
    fun `phase one reports the gate, with a hit and a miss alike`() {
        val params = roundOf(Cell(col = 5, row = 5))

        judge(params = params, guess = pins(5.5 to 5.5)).outcome shouldBe
            EchoLocateOutcome(distance = 0.0, withinTolerance = true, pinOf = listOf(0))
        (judge(params = params, guess = pins(12.5 to 5.5)).outcome as EchoLocateOutcome).withinTolerance shouldBe false
    }

    @Test
    fun `phase two has no gate`() {
        val params = roundOf(Cell(col = 5, row = 5), phase = Phase.TWO)

        val far = judge(params = params, guess = pins(18.0 to 18.0))

        far.qualifies shouldBe true
        far.deviation shouldBeGreaterThan 10.0
        (far.outcome as EchoLocateOutcome).withinTolerance.shouldBeNull()
    }

    @Test
    fun `the stored guess is exactly pins and rings`() {
        val params = roundOf(Cell(col = 5, row = 5))
        val guess = """{"pins":[{"x":5.5,"y":5.25}],"rings":[[5.5],[],[7.25]]}"""

        val stored = judge(params = params, guess = guess).guess.shouldNotBeNull()

        stored shouldBe json(guess)
        stored.propertyNames().toSet() shouldBe setOf("pins", "rings")
        stored.get("pins").first().propertyNames().toSet() shouldBe setOf("x", "y")
    }

    @Test
    fun `malformed guesses are refused before anything is written`() {
        val one = roundOf(Cell(col = 5, row = 5))
        val two = roundOf(Cell(col = 5, row = 5), Cell(col = 15, row = 15))
        val pin = """{"x":1.0,"y":1.0}"""

        listOf(
            """{"rings":[]}""",
            """{"pins":[$pin]}""",
            """{"pins":[$pin],"rings":[],"extra":1}""",
            """{"pins":[],"rings":[]}""",
            """{"pins":[$pin,$pin],"rings":[]}""",
            """{"pins":$pin,"rings":[]}""",
            """{"pins":[{"x":-0.1,"y":1.0}],"rings":[]}""",
            """{"pins":[{"x":20.1,"y":1.0}],"rings":[]}""",
            """{"pins":[{"x":1.0,"y":-0.1}],"rings":[]}""",
            """{"pins":[{"x":1.0,"y":20.1}],"rings":[]}""",
            """{"pins":[{"x":"1","y":1.0}],"rings":[]}""",
            """{"pins":[{"x":1.0}],"rings":[]}""",
            """{"pins":[{"x":1.0,"y":1.0,"z":0}],"rings":[]}""",
            """{"pins":[$pin],"rings":[[],[],[],[]]}""",
            """{"pins":[$pin],"rings":[[1.0,2.0]]}""",
            """{"pins":[$pin],"rings":[[-0.1]]}""",
            """{"pins":[$pin],"rings":[[40.1]]}""",
            """{"pins":[$pin],"rings":[["5"]]}""",
            """{"pins":[$pin],"rings":[5.0]}""",
            """{"pins":[$pin],"rings":{}}""",
            """{"pins":[$pin],"rings":null}""",
            "[]",
            "null",
        ).forEach { text ->
            shouldThrow<InvalidGuessException> { judge(params = one, guess = text) }
        }

        listOf(
            """{"pins":[$pin],"rings":[]}""",
            """{"pins":[$pin,$pin,$pin],"rings":[]}""",
            """{"pins":[$pin,$pin],"rings":[[1.0,2.0,3.0]]}""",
        ).forEach { text ->
            shouldThrow<InvalidGuessException> { judge(params = two, guess = text) }
        }
    }

    @Test
    fun `a ring without a ping is accepted`() {
        val params = roundOf(Cell(col = 5, row = 5))

        judge(params = params, guess = """{"pins":[{"x":5.5,"y":5.5}],"rings":[[5.0]]}""").qualifies shouldBe true
        judge(params = params, guess = """{"pins":[{"x":5.5,"y":5.5}],"rings":[[0.0],[40.0],[]]}""")
            .qualifies shouldBe true
    }

    @Test
    fun `two rings per wave are accepted for two clips`() {
        val params = roundOf(Cell(col = 5, row = 5), Cell(col = 15, row = 15))

        val guess = """{"pins":[{"x":5.5,"y":5.5},{"x":15.5,"y":15.5}],"rings":[[1.0,2.0],[3.0,4.0]]}"""

        judge(params = params, guess = guess).qualifies shouldBe true
    }

    @Test
    fun `one asset per clip, open from the reveal`() {
        val params = draw(context = context(difficulty = 1.0))

        val assets = game.produceAssets(params)

        assets.map { it.name } shouldBe listOf("clip-0", "clip-1")
        assets.map { it.visibility } shouldBe listOf(AssetVisibility.FromStage(0), AssetVisibility.FromStage(0))
        assets.map { it.mediaType } shouldBe listOf("audio/wav", "audio/wav")
        assets.map { it.bytes.toList() } shouldBe params.clipIds.map { wavs.getValue(it).toList() }
    }

    @Test
    fun `a deleted clip is missing from the assets, the other stays`() {
        val params = draw(context = context(difficulty = 1.0))
        every { clips.prepared(params.clipIds[0]) } returns null

        game.produceAssets(params).map { it.name } shouldBe listOf("clip-1")

        every { clips.prepared(params.clipIds[0]) } returns wavs.getValue(params.clipIds[0])
        every { clips.prepared(params.clipIds[1]) } returns null

        game.produceAssets(params).map { it.name } shouldBe listOf("clip-0")
    }

    @Test
    fun `a clip that cannot be prepared is treated like a deleted one`() {
        val params = draw(context = context(difficulty = 1.0))
        every { clips.prepared(params.clipIds[0]) } throws IllegalArgumentException("not 16-bit PCM")

        val warnings = logOf { game.produceAssets(params).map { it.name } shouldBe listOf("clip-1") }

        // The cause rides along as the throwable, stack trace and all, not flattened into the text.
        warnings.single().throwableProxy.shouldNotBeNull().message shouldBe "not 16-bit PCM"
    }

    /** What [EchoLocateGameType] logs while [block] runs, kept off the console. */
    private fun logOf(block: () -> Unit): List<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(EchoLocateGameType::class.java) as Logger
        val captured = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(captured)
        logger.isAdditive = false
        try {
            block()
        } finally {
            logger.detachAppender(captured)
            logger.isAdditive = true
        }

        return captured.list
    }

    @Test
    fun `a round without any clip left produces no assets`() {
        val params = draw()
        every { clips.prepared(any()) } returns null

        game.produceAssets(params).shouldBeEmpty()
    }
}
