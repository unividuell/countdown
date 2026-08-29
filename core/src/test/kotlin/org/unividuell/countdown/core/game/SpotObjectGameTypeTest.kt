package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.SpotObjectGameType
import org.unividuell.countdown.core.game.internal.SpotObjectOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.spotobject.CountryLookup
import org.unividuell.countdown.core.spotobject.SpotObjectTerms
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

class SpotObjectGameTypeTest {

    private val countries = mockk<CountryLookup>()
    private val game = SpotObjectGameType(
        terms = SpotObjectTerms(listOf("Rosa Gartenzwerg", "Umgedrehtes Fahrrad")),
        countries = countries,
    )
    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    private fun guessOf(
        panoId: String = "abc", heading: Double = 12.0, pitch: Double = 0.0, zoom: Double = 1.0,
    ) = mapper.readTree(
        """{"panoId":"$panoId","heading":$heading,"pitch":$pitch,"zoom":$zoom}""",
    )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "spot-object"
        game.displayName shouldBe "Weltanschauung"
    }

    /**
     * This game has no round secret, so the solution stream is unused — and the field-set tests
     * below pin exactly that emptiness. They are not ceremony: they are where it would show if
     * something got laid into the payload later that not everyone may see.
     */
    @Test
    fun `the term follows the presentation seed alone`() {
        draw(phase = Phase.ONE, seed = 1, presentationSeed = 7).term shouldBe
            draw(phase = Phase.ONE, seed = 2, presentationSeed = 7).term
    }

    @Test
    fun `the payload carries exactly the term`() {
        val json = mapper.valueToTree<JsonNode>(game.present(draw(phase = Phase.ONE)))

        json.propertyNames().toList() shouldContainExactly listOf("term")
    }

    @Test
    fun `there is nothing to reveal`() {
        game.solution(draw(phase = Phase.ONE)).shouldBeNull()
        game.solution(draw(phase = Phase.TWO)).shouldBeNull()
    }

    @Test
    fun `only phase two asks for a deliberate reveal`() {
        game.requiresReveal(draw(phase = Phase.ONE)) shouldBe false
        game.requiresReveal(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `peer review is on in both phases`() {
        game.allowsPeerReview(draw(phase = Phase.ONE)) shouldBe true
        game.allowsPeerReview(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `every formally valid tip qualifies, and carries the country it was resolved to`() {
        every { countries.countryOf("abc") } returns "ES"

        val judged = game.judge(params = draw(phase = Phase.ONE), guess = guessOf())

        judged.qualifies shouldBe true
        judged.deviation shouldBe 0.0
        judged.outcome shouldBe SpotObjectOutcome(country = "ES")
    }

    @Test
    fun `a country that cannot be resolved is not an error`() {
        every { countries.countryOf(any()) } returns null

        game.judge(params = draw(phase = Phase.ONE), guess = guessOf()).outcome shouldBe
            SpotObjectOutcome(country = null)
    }

    @Test
    fun `a malformed tip is rejected before anything is written`() {
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = mapper.readTree("""{}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(panoId = " "))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(heading = 400.0))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(pitch = -91.0))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(zoom = 5.5))
        }
    }

    /** The lookup must not be reached for a guess that was going to be refused anyway. */
    @Test
    fun `a malformed tip never reaches the country lookup`() {
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = mapper.readTree("""{}"""))
        }
        verify(exactly = 0) { countries.countryOf(any()) }
    }
}
