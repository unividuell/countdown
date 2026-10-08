package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class GameCatalogTest {

    data class FakeParams(val label: String, val secret: Int)
    data class FakePayload(val label: String) : GamePayload
    data class FakeOutcome(val seen: String) : GameOutcome
    data class FakeSolution(val secret: Int) : GameSolution

    private class FakeGame(
        override val id: String,
        private val available: Boolean = true,
    ) : GameType<FakeParams> {
        override val displayName = "Fake $id"
        override val paramsType = FakeParams::class.java
        override fun draw(random: GameRandom, context: RoundContext) =
            FakeParams(label = "$id-${context.roundNumber}", secret = random.solution.nextInt(1000))
        override fun present(params: FakeParams) = FakePayload(label = params.label)
        override fun requiresReveal(params: FakeParams) = params.secret % 2 == 0
        override fun scoresOnDuration(params: FakeParams) = params.secret % 3 == 0
        override fun judge(params: FakeParams, guess: JsonNode) = Judgement(
            qualifies = guess.get("ok")?.asBoolean() == true,
            deviation = 0.0,
            outcome = FakeOutcome(seen = params.label),
        )
        override fun solution(params: FakeParams) = FakeSolution(secret = params.secret)
        override fun isAvailable(context: RoundContext) = available
    }

    private val mapper = JsonMapper.builder().build()

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")

    private val context = RoundContext(
        communityId = community,
        roundNumber = 3,
        phase = Phase.ONE,
    )

    private fun catalog(vararg games: GameType<*>) = GameCatalog(games = games.toList(), mapper = mapper)

    @Test
    fun `ids are sorted, so a draw from the same seed is reproducible regardless of bean order`() {
        val sorted = catalog(FakeGame("zulu"), FakeGame("alpha")).ids()

        sorted shouldContainExactly listOf("alpha", "zulu")
    }

    @Test
    fun `a duplicate id fails the boot rather than shadowing a game`() {
        val e = shouldThrow<IllegalArgumentException> { catalog(FakeGame("same"), FakeGame("same")) }

        e.message.shouldNotBeNull() shouldContain "same"
    }

    @Test
    fun `an unknown id has no handle`() {
        catalog(FakeGame("alpha")).handle("nope").shouldBeNull()
    }

    @Test
    fun `the handle round-trips params through json without the caller knowing the type`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        val json = handle.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(7),
                presentation = SeededRandom.fromSeed(8),
                scene = SeededRandom.fromSeed(0x5CE),
            ),
            context = RoundContext(communityId = community, roundNumber = 12, phase = Phase.ONE),
        )
        val payload = handle.present(json)

        json.toString() shouldContain "alpha-12"
        payload shouldBe FakePayload(label = "alpha-12")
    }

    @Test
    fun `the handle exposes id and display name for the announcement`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        handle.id shouldBe "alpha"
        handle.displayName shouldBe "Fake alpha"
    }

    @Test
    fun `the handle judges and solves from a stored params blob`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()
        val params = handle.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(7),
                presentation = SeededRandom.fromSeed(8),
                scene = SeededRandom.fromSeed(0x5CE),
            ),
            context = RoundContext(communityId = community, roundNumber = 12, phase = Phase.ONE),
        )

        // A game that ignores the context is judged as without it.
        val judgement = handle.judge(
            params = params, guess = mapper.readTree("""{"ok":true}"""), context = GuessContext(sinceRevealMs = 5, playId = null),
        )

        judgement.qualifies shouldBe true
        judgement.outcome shouldBe FakeOutcome(seen = "alpha-12")
        handle.solution(params).shouldNotBeNull()
    }

    @Test
    fun `the handle answers the reveal question from a stored params blob`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        // `FakeGame.requiresReveal` answers off `secret`'s parity, not a constant — a fake that
        // returns the same value regardless of `params` would keep this test green even if
        // `GameTypeHandle.requiresReveal` were hard-coded, so both directions are asserted through
        // the handle, from blobs the handle itself never drew.
        handle.requiresReveal(mapper.valueToTree(FakeParams(label = "even", secret = 4))) shouldBe true
        handle.requiresReveal(mapper.valueToTree(FakeParams(label = "odd", secret = 5))) shouldBe false
    }

    @Test
    fun `the handle answers the duration question from a stored params blob`() {
        val handle = catalog(FakeGame("alpha")).handle("alpha").shouldNotBeNull()

        // Mod 3 on purpose, not mod 2: the two questions must not share an answer, or a handle
        // wired to `requiresReveal` would pass.
        handle.scoresOnDuration(mapper.valueToTree(FakeParams(label = "three", secret = 3))) shouldBe true
        handle.scoresOnDuration(mapper.valueToTree(FakeParams(label = "four", secret = 4))) shouldBe false
    }

    @Test
    fun `a game that cannot draw for this round is not a candidate`() {
        val ids = catalog(FakeGame("zulu"), FakeGame(id = "empty", available = false), FakeGame("alpha"))
            .availableIds(context)

        ids shouldContainExactly listOf("alpha", "zulu")
    }

    @Test
    fun `a game that says nothing is available`() {
        catalog(FakeGame("silent")).availableIds(context) shouldContainExactly listOf("silent")
    }
}
