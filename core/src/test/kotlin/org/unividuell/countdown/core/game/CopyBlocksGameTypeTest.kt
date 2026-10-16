package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.copyblocks.Block
import org.unividuell.countdown.core.copyblocks.BlockType
import org.unividuell.countdown.core.copyblocks.CopyBlocksShape
import org.unividuell.countdown.core.copyblocks.Fit
import org.unividuell.countdown.core.game.internal.CopyBlocksGameType
import org.unividuell.countdown.core.game.internal.CopyBlocksOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class CopyBlocksGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val mapper = JsonMapper.builder().build()
    private val game = CopyBlocksGameType(mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun draw(random: GameRandom = random(), phase: Phase = Phase.ONE) = game.draw(
        random = random,
        context = RoundContext(communityId = community, roundNumber = 12, phase = phase),
    )

    private fun tree(value: Any?): JsonNode = mapper.readTree(mapper.writeValueAsString(value))

    private fun guess(json: String) = mapper.readTree(json)

    private fun guessOf(blocks: List<Block>): JsonNode = mapper.valueToTree(mapOf("blocks" to blocks))

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "copy-blocks"
        game.displayName shouldBe "Blockierung"
    }

    @Test
    fun `a round has 8 to 58 blocks of the first 3 to 7 types, as a visible, normalised template`() {
        val drawn = (1..60).map { draw(random = random(presentation = it)) }

        drawn.forEach { params ->
            params.grid shouldBe 6
            params.blocks.size shouldBeInRange 8..58
            params.types.size shouldBeInRange 3..7
            params.types shouldBe BlockType.entries.take(params.types.size)
            params.types.containsAll(params.blocks.map { it.type }) shouldBe true
            listOf(params.blocks.minOf { it.x }, params.blocks.minOf { it.y }, params.blocks.minOf { it.z }) shouldBe
                listOf(0, 0, 0)
            CopyBlocksShape.allVisible(params.blocks.map { it.cell() }.toSet()) shouldBe true
        }
        drawn.map { it.types.size }.toSet() shouldBe (3..7).toSet()
        drawn.map { it.blocks.size }.toSet().size shouldBeGreaterThan 20
    }

    @Test
    fun `everything follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)) shouldBe draw(random = random(presentation = 2))
    }

    @Test
    fun `phase two is timed - one deliberate reveal, scored on the clock`() {
        val one = draw(phase = Phase.ONE)
        val two = draw(phase = Phase.TWO)

        one.timed shouldBe false
        game.requiresReveal(one) shouldBe false
        game.scoresOnDuration(one) shouldBe false
        two.timed shouldBe true
        game.requiresReveal(two) shouldBe true
        game.scoresOnDuration(two) shouldBe true
    }

    @Test
    fun `payload and outcome carry exactly their fields, scene and solution nothing`() {
        val params = draw()
        val payload = tree(game.present(params))
        val outcome = tree(game.judge(params = params, guess = guessOf(params.blocks)).outcome)

        game.scene(params).shouldBeNull()
        game.solution(params).shouldBeNull()
        payload.propertyNames().toSet() shouldBe setOf("grid", "types", "blocks")
        payload.get("types").get(0).asString() shouldBe "DIRT"
        payload.get("blocks").get(0).propertyNames().toSet() shouldBe setOf("x", "y", "z", "type")
        outcome.propertyNames().toSet() shouldBe setOf("correct", "fit", "missing", "extra", "wrongType")
        outcome.get("fit").propertyNames().toSet() shouldBe setOf("turns", "dx", "dy", "dz")
    }

    @Test
    fun `the template turned and shifted is a hit`() {
        val params = draw()
        val fit = Fit(turns = 3, dx = -2, dy = 0, dz = 5)
        val turned = params.blocks.map { b ->
            fit.toGuess(b.cell()).let { Block(x = it.x, y = it.y, z = it.z, type = b.type) }
        }

        game.judge(params = params, guess = guessOf(turned)).let {
            it.qualifies shouldBe true
            it.deviation shouldBe 0.0
            (it.outcome as CopyBlocksOutcome).correct shouldBe true
        }
    }

    @Test
    fun `one block short is a miss, and the outcome names it`() {
        val params = draw()

        game.judge(params = params, guess = guessOf(params.blocks.drop(1))).let {
            it.qualifies shouldBe false
            (it.outcome as CopyBlocksOutcome).missing shouldHaveSize 1
        }
    }

    @Test
    fun `the stored guess is the validated block list and nothing else`() {
        val stored = game.judge(
            params = draw(),
            guess = guess("""{"blocks":[{"x":0,"y":0,"z":0,"type":"DIRT","note":"hi"}],"pasted":[1,2]}"""),
        ).guess.shouldNotBeNull()

        stored.propertyNames().toSet() shouldBe setOf("blocks")
        stored.get("blocks").get(0).propertyNames().toSet() shouldBe setOf("x", "y", "z", "type")
    }

    @Test
    fun `the wire's limits are valid guesses`() {
        val params = draw()
        val most = (0 until 200).joinToString(",") { i ->
            """{"x":${i % 10},"y":${i / 10 % 10},"z":${i / 100},"type":"DIRT"}"""
        }

        shouldNotThrowAny {
            game.judge(params = params, guess = guess("""{"blocks":[{"x":64,"y":-64,"z":0,"type":"LEAVES"}]}"""))
            game.judge(params = params, guess = guess("""{"blocks":[$most]}"""))
        }
    }

    @Test
    fun `a malformed guess is refused before anything is written`() {
        val params = draw().copy(types = BlockType.entries.take(3))
        val block = """{"x":0,"y":0,"z":0,"type":"DIRT"}"""
        val tooMany = (0 until 201).joinToString(",") { i ->
            """{"x":${i % 10},"y":${i / 10 % 10},"z":${i / 100},"type":"DIRT"}"""
        }
        listOf(
            """{}""",
            """{"blocks":[]}""",
            """{"blocks":"DIRT"}""",
            """{"blocks":[$tooMany]}""",
            """{"blocks":[$block,$block]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":"STONE"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":"GLASS"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":1}]}""",
            """{"blocks":[{"x":65,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"y":-65,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":1.5,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":"3","y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":9999999999,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0}]}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(json)) }
        }
    }

    @Test
    fun `it is always available`() {
        game.isAvailable(RoundContext(communityId = community, roundNumber = 1, phase = Phase.ONE)) shouldBe true
    }
}
