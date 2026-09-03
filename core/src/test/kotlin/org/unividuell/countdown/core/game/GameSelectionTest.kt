package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.DifferentFromPreviousRound
import org.unividuell.countdown.core.game.internal.PastRound
import org.unividuell.countdown.core.rng.SeededRandom

class GameSelectionTest {

    private val selection = DifferentFromPreviousRound()

    private fun random() = SeededRandom.fromSeed(4711)

    @Test
    fun `with an empty history it picks any candidate`() {
        val picked = selection.pick(
            candidates = listOf("alpha", "beta"), history = emptyList(), random = random(),
        )

        listOf("alpha", "beta") shouldContain picked
    }

    @Test
    fun `it does not pick the type of the round before`() {
        // history is most-recently-played first, so "alpha" is the previous round.
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        repeat(20) {
            selection.pick(
                candidates = listOf("alpha", "beta"),
                history = history,
                random = SeededRandom.fromSeed(it),
            ) shouldBe "beta"
        }
    }

    @Test
    fun `the rule is a preference - with one type it repeats rather than cancelling the game`() {
        val history = listOf(PastRound(roundNumber = 9, gameType = "alpha"))

        selection.pick(
            candidates = listOf("alpha"), history = history, random = random(),
        ) shouldBe "alpha"
    }

    @Test
    fun `no candidates means no game`() {
        selection.pick(candidates = emptyList(), history = emptyList(), random = random())
            .shouldBeNull()
    }

    @Test
    fun `only the round immediately before counts, not the whole history`() {
        // "beta" was two rounds ago and is fair game again; only "alpha" is excluded.
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        val picked = selection.pick(
            candidates = listOf("alpha", "beta"), history = history, random = random(),
        )

        picked shouldBe "beta"
        picked shouldNotBe "alpha"
    }

    @Test
    fun `the same random stream yields the same choice`() {
        val candidates = listOf("alpha", "beta", "gamma")

        val first = selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(99))
        val second = selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(99))

        first shouldBe second
    }

    @Test
    fun `it draws over all candidates, not just the first`() {
        // A rule that always returned candidates.first() would pass every test above. This one
        // fails unless the choice actually varies with the random stream.
        val candidates = listOf("alpha", "beta", "gamma")

        val seen = (0 until 50).mapNotNull {
            selection.pick(candidates = candidates, history = emptyList(), random = SeededRandom.fromSeed(it))
        }.toSet()

        seen shouldBe candidates.toSet()
    }
}
