package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.GameCatalog
import org.unividuell.countdown.core.game.internal.GamePayload
import org.unividuell.countdown.core.game.internal.GameType
import org.unividuell.countdown.core.game.internal.Phase
import org.unividuell.countdown.core.game.internal.RoundContext
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

class GameCatalogTest {

    data class FakeParams(val label: String, val secret: Int)
    data class FakePayload(val label: String) : GamePayload

    private class FakeGame(override val id: String) : GameType<FakeParams> {
        override val displayName = "Fake $id"
        override val paramsType = FakeParams::class.java
        override fun draw(random: SeededRandom, context: RoundContext) =
            FakeParams(label = "$id-${context.roundNumber}", secret = random.nextInt(1000))
        override fun present(params: FakeParams) = FakePayload(label = params.label)
    }

    private val mapper = JsonMapper.builder().build()

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
            random = SeededRandom.fromSeed(7),
            context = RoundContext(roundNumber = 12, phase = Phase.ONE),
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
}
