package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.internal.MatchScaleGameType
import org.unividuell.countdown.core.game.internal.MatchScaleOutcome
import org.unividuell.countdown.core.game.internal.MatchScaleParams
import org.unividuell.countdown.core.matchscale.MatchScaleDataset
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.DoubleNode
import tools.jackson.databind.node.ObjectNode
import java.util.UUID
import kotlin.math.ln

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class MatchScaleGameTypeTest(
    @Autowired val game: MatchScaleGameType,
    @Autowired val springMapper: ObjectMapper,
) {
    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")

    private val mapper = JsonMapper.builder().build()

    private fun draw(
        phase: Phase,
        seed: Int = 4711,
        presentationSeed: Int = 0x1234,
        previous: List<JsonNode> = emptyList(),
    ) = game.draw(
        random = GameRandom(
            solution = SeededRandom.fromSeed(seed),
            presentation = SeededRandom.fromSeed(presentationSeed),
            scene = SeededRandom.fromSeed(0x5CE),
        ),
        context = RoundContext(communityId = community, roundNumber = 12, phase = phase, previousParams = previous),
    )

    private fun guess(scale: Double) = mapper.readTree("""{"scale":$scale}""")

    private fun fieldsOf(value: Any) = mapper.readTree(mapper.writeValueAsString(value))

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "match-scale"
        game.displayName shouldBe "Augenmaß"
    }

    @Test
    fun `it is available while a category is active and unavailable without one`() {
        val context = RoundContext(communityId = community, roundNumber = 1, phase = Phase.ONE, previousParams = emptyList())

        game.isAvailable(context) shouldBe true
        MatchScaleGameType(dataset = MatchScaleDataset(emptyList()), mapper = mapper).isAvailable(context) shouldBe false
    }

    @Test
    fun `the same seed draws the same round`() {
        draw(phase = Phase.ONE, presentationSeed = 99) shouldBe draw(phase = Phase.ONE, presentationSeed = 99)
    }

    @Test
    fun `phase one bakes in a tenth of tolerance, phase two has no gate at all`() {
        draw(phase = Phase.ONE).toleranceFactor shouldBe 1.1
        draw(phase = Phase.TWO).toleranceFactor.shouldBeNull()
    }

    @Test
    fun `the payload carries exactly what the player needs and nothing else`() {
        val node = fieldsOf(game.present(draw(phase = Phase.ONE)))

        node.propertyNames().toSet() shouldBe setOf("categoryName", "a", "b", "toleranceFactor")
        listOf("a", "b").forEach {
            node.get(it).propertyNames().toSet() shouldBe setOf("name", "path", "width", "height", "attribution")
        }
    }

    @Test
    fun `phase two's payload still carries toleranceFactor, as an explicit null`() {
        val node = fieldsOf(game.present(draw(phase = Phase.TWO)))

        node.propertyNames().toSet() shouldBe setOf("categoryName", "a", "b", "toleranceFactor")
        node.get("toleranceFactor").isNull shouldBe true
    }

    @Test
    fun `the payload never carries a metre value`() {
        fun names(node: JsonNode): Set<String> =
            node.propertyNames().toSet() + node.properties().flatMap { names(it.value) }

        val params = draw(phase = Phase.ONE)
        params.measureA shouldNotBe null

        names(fieldsOf(game.present(params))) intersect
            setOf("factor", "metresPerUnit", "metres", "measure", "measureA", "measureB") shouldBe emptySet()
    }

    @Test
    fun `nothing the player sees moves when only the solution stream changes`() {
        val drawn = (1..20).map { seed -> draw(phase = Phase.ONE, seed = seed) }

        drawn.map { game.present(it) }.distinct() shouldHaveSize 1
    }

    @Test
    fun `a pair already drawn in this edition is not drawn again`() {
        val first = draw(phase = Phase.ONE)
        val previous = listOf(mapper.valueToTree<JsonNode>(first))

        val sameCategory = (1..30)
            .map { seed -> draw(phase = Phase.ONE, presentationSeed = seed, previous = previous) }
            .filter { it.category == first.category }

        sameCategory.isNotEmpty() shouldBe true
        sameCategory.forEach {
            setOf(it.a.name, it.b.name).intersect(setOf(first.a.name, first.b.name)) shouldBe emptySet()
        }
    }

    @Test
    fun `a round frozen before measures existed still reads`() {
        val stored = mapper.valueToTree<ObjectNode>(draw(phase = Phase.ONE))
            .apply { remove(listOf("measureA", "measureB")) }

        val params = springMapper.treeToValue(stored, MatchScaleParams::class.java)

        params.measureA.shouldBeNull()
        game.solution(params).b.shouldBeNull()
    }

    @Test
    fun `a huge finite scale still yields a finite deviation`() {
        val params = draw(phase = Phase.ONE)

        val judgement = game.judge(params = params, guess = guess(1e308))

        judgement.deviation.isFinite() shouldBe true
        judgement.qualifies shouldBe false
    }

    @Test
    fun `the solution carries exactly the factor, the tolerance and both measures`() {
        val node = fieldsOf(game.solution(draw(phase = Phase.ONE)))

        node.propertyNames().toSet() shouldBe setOf("factor", "toleranceFactor", "a", "b")
        listOf("a", "b").forEach {
            node.get(it).propertyNames().toSet() shouldBe setOf("axis", "metres", "source")
        }

        val phaseTwo = fieldsOf(game.solution(draw(phase = Phase.TWO)))
        phaseTwo.get("toleranceFactor").isNull shouldBe true
    }

    @Test
    fun `the outcome names the scale, the deviation and the verdict`() {
        val params = draw(phase = Phase.ONE)
        val node = fieldsOf(game.judge(params = params, guess = guess(params.factor)).outcome!!)

        node.propertyNames().toSet() shouldBe setOf("scale", "deviation", "withinTolerance")
    }

    @Test
    fun `the exact factor is a perfect, qualifying guess`() {
        val params = draw(phase = Phase.ONE)

        val judgement = game.judge(params = params, guess = guess(params.factor))

        judgement.qualifies shouldBe true
        judgement.deviation shouldBe (0.0 plusOrMinus 1e-9)
    }

    @Test
    fun `too large and too small by the same ratio are equally far off`() {
        val params = draw(phase = Phase.ONE)

        val large = game.judge(params = params, guess = guess(params.factor * 2)).deviation
        val small = game.judge(params = params, guess = guess(params.factor / 2)).deviation

        large shouldBe (ln(2.0) plusOrMinus 1e-9)
        small shouldBe (large plusOrMinus 1e-9)
    }

    @Test
    fun `in phase one the tolerance is the gate`() {
        val params = draw(phase = Phase.ONE)

        game.judge(params = params, guess = guess(params.factor * 1.1)).qualifies shouldBe true
        game.judge(params = params, guess = guess(params.factor * 1.11)).qualifies shouldBe false
        game.judge(params = params, guess = guess(params.factor / 1.1)).qualifies shouldBe true
        game.judge(params = params, guess = guess(params.factor / 1.11)).qualifies shouldBe false
    }

    @Test
    fun `in phase two there is no gate, and the outcome has no verdict`() {
        val params = draw(phase = Phase.TWO)

        val judgement = game.judge(params = params, guess = guess(params.factor * 9))

        judgement.qualifies shouldBe true
        (judgement.outcome as MatchScaleOutcome).withinTolerance.shouldBeNull()
    }

    @Test
    fun `a malformed guess is rejected before anything can be written`() {
        val params = draw(phase = Phase.ONE)

        listOf(
            mapper.readTree("""{}"""),
            guess(0.0),
            guess(-1.0),
            mapper.readTree("""{"scale":"2"}"""),
            mapper.createObjectNode().set("scale", DoubleNode.valueOf(Double.NaN)),
            mapper.createObjectNode().set("scale", DoubleNode.valueOf(Double.POSITIVE_INFINITY)),
        ).forEach { shouldThrow<InvalidGuessException> { game.judge(params = params, guess = it) } }
    }

    @Test
    fun `the stored guess keeps only the scale`() {
        val judgement = game.judge(
            params = draw(phase = Phase.ONE),
            guess = mapper.readTree("""{"scale":2.0,"x":1}"""),
        )

        judgement.guess shouldNotBe null
        judgement.guess!!.propertyNames().toSet() shouldBe setOf("scale")
        judgement.guess!!.get("scale").asDouble() shouldBe 2.0
    }

    @Test
    fun `no phase needs a deliberate reveal or scores on time`() {
        val params = draw(phase = Phase.TWO)

        game.requiresReveal(params) shouldBe false
        game.scoresOnDuration(params) shouldBe false
        game.scene(params).shouldBeNull()
    }
}
