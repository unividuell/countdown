package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.string.shouldStartWith
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.findpattern.FindPatternBoard
import org.unividuell.countdown.core.findpattern.FindPatternLayout
import org.unividuell.countdown.core.game.internal.FindPatternGameType
import org.unividuell.countdown.core.game.internal.FindPatternOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

/**
 * The adapter, tested without a Spring context: it has no collaborators to inject — everything it
 * needs is `findpattern`'s pure functions.
 */
class FindPatternGameTypeTest {

    private val game = FindPatternGameType()
    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    private fun guessOf(startIndex: Int) = mapper.readTree("""{"startIndex":$startIndex}""")

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "find-pattern"
        game.displayName shouldBe "Musterung"
    }

    @Test
    fun `a drawn round carries a full board, a palette and a start index in range`() {
        val params = draw(phase = Phase.ONE)

        params.blocks shouldHaveSize FindPatternLayout.BLOCK_COUNT
        params.palette shouldHaveSize FindPatternLayout.PALETTE_SIZE
        params.patternStartIndex shouldBe
            params.patternStartIndex.coerceIn(minimumValue = 0, maximumValue = FindPatternLayout.LAST_START_INDEX)
    }

    /** The board is shown, the answer is not — so they must not share a stream. */
    @Test
    fun `the board follows the presentation seed alone`() {
        val a = draw(phase = Phase.ONE, seed = 1, presentationSeed = 7)
        val b = draw(phase = Phase.ONE, seed = 2, presentationSeed = 7)

        a.blocks shouldBe b.blocks
        a.palette shouldBe b.palette
        a.delta shouldBe b.delta
    }

    @Test
    fun `the start index follows the solution seed alone`() {
        val a = draw(phase = Phase.ONE, seed = 5, presentationSeed = 7)
        val b = draw(phase = Phase.ONE, seed = 5, presentationSeed = 99)

        a.patternStartIndex shouldBe b.patternStartIndex
    }

    @Test
    fun `only phase two asks for a deliberate reveal`() {
        game.requiresReveal(draw(phase = Phase.ONE)) shouldBe false
        game.requiresReveal(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `the payload carries exactly the five fields the client needs`() {
        val json = mapper.writeValueAsString(game.present(draw(phase = Phase.ONE)))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("cols", "rows", "patternLength", "boardImage", "patternImage")
    }

    @Test
    fun `the payload's images are png data uris and its measures are the layout`() {
        val payload = game.present(draw(phase = Phase.ONE))

        payload.cols shouldBe FindPatternLayout.COLS
        payload.rows shouldBe FindPatternLayout.ROWS
        payload.patternLength shouldBe FindPatternLayout.PATTERN_LENGTH
        payload.boardImage shouldStartWith "data:image/png;base64,"
        payload.patternImage shouldStartWith "data:image/png;base64,"
        payload.boardImage shouldNotBe payload.patternImage
    }

    @Test
    fun `the solution carries exactly the five fields the reveal needs`() {
        val json = mapper.writeValueAsString(game.solution(draw(phase = Phase.ONE)))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("blocks", "pattern", "palette", "delta", "startIndices")
    }

    @Test
    fun `the solution names every possibility, the drawn one included`() {
        val params = draw(phase = Phase.ONE)
        val solution = game.solution(params)

        solution.pattern shouldContainExactly
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = params.patternStartIndex)
        solution.startIndices shouldContain params.patternStartIndex
        solution.startIndices.forEach {
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = it) shouldBe solution.pattern
        }
    }

    @Test
    fun `the drawn start index qualifies, and so does every other possibility`() {
        val params = draw(phase = Phase.ONE)

        game.solution(params).startIndices.forEach {
            game.judge(params = params, guess = guessOf(it)).qualifies shouldBe true
        }
    }

    @Test
    fun `a run that does not match does not qualify`() {
        val params = draw(phase = Phase.ONE)
        val possibilities = game.solution(params).startIndices.toSet()
        val miss = (0..FindPatternLayout.LAST_START_INDEX).first { it !in possibilities }

        val judgement = game.judge(params = params, guess = guessOf(miss))

        judgement.qualifies shouldBe false
        judgement.outcome shouldBe FindPatternOutcome(correct = false)
    }

    /** The framework overwrites this for a timed round; the game itself never ranks. */
    @Test
    fun `the game reports no distance of its own`() {
        val params = draw(phase = Phase.TWO)

        game.judge(params = params, guess = guessOf(params.patternStartIndex)).deviation shouldBe 0.0
    }

    @Test
    fun `an out-of-range or malformed guess is refused before anything is written`() {
        val params = draw(phase = Phase.ONE)

        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guessOf(-1)) }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = guessOf(FindPatternLayout.LAST_START_INDEX + 1))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"startIndex":"3"}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"startIndex":3.5}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("{}"))
        }
    }

    @Test
    fun `the last legal start index is playable`() {
        val params = draw(phase = Phase.ONE)

        game.judge(params = params, guess = guessOf(FindPatternLayout.LAST_START_INDEX))
            .outcome shouldNotBe null
    }
}
