package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.NotRecentlyPlayed
import org.unividuell.countdown.core.game.internal.PastRound
import org.unividuell.countdown.core.rng.SeededRandom

class GameSelectionTest {

    private val selection = NotRecentlyPlayed()

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
    fun `with few candidates only the round immediately before counts`() {
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

    private val fourteen = (1..14).map { "g%02d".format(it) }

    /** [types] most recent first, as `historyOf` returns them. */
    private fun historyOf(vararg types: String) =
        types.mapIndexed { i, type -> PastRound(roundNumber = 100 - i, gameType = type) }

    private fun picksOver(seeds: Int, history: List<PastRound>) = (0 until seeds).mapNotNull {
        selection.pick(candidates = fourteen, history = history, random = SeededRandom.fromSeed(it))
    }.toSet()

    @Test
    fun `with fourteen candidates the last ten rounds are blocked`() {
        val history = historyOf(*fourteen.take(10).toTypedArray())

        picksOver(seeds = 50, history = history) shouldBe fourteen.drop(10).toSet()
    }

    @Test
    fun `the eleventh round back is free again`() {
        // g01 was played eleven rounds ago, outside the block of ten.
        val history = historyOf(*fourteen.drop(1).take(10).toTypedArray(), "g01")

        picksOver(seeds = 50, history = history) shouldContain "g01"
    }

    @Test
    fun `a short history blocks only what it holds`() {
        val history = historyOf("g01", "g02")

        picksOver(seeds = 200, history = history) shouldBe (fourteen - setOf("g01", "g02")).toSet()
    }

    @Test
    fun `a type no longer available still takes a block slot without failing`() {
        // "gone" is not a candidate; the block of ten then covers only nine candidates.
        val history = historyOf("gone", *fourteen.take(9).toTypedArray())

        picksOver(seeds = 200, history = history) shouldBe fourteen.drop(9).toSet()
    }

    @Test
    fun `over editions of 140 rounds every game comes up 8 to 12 times`() {
        // One seed proves nothing: uniform choice stays inside 8-12 for 1 seed in 1000 (4711 is
        // one). Over 100 seeds this rule stays inside for about 95, uniform choice for none.
        val inside = (0 until 100).count { seed ->
            val random = SeededRandom.fromSeed(seed)
            val history = ArrayDeque<PastRound>()

            repeat(140) { round ->
                val picked = requireNotNull(selection.pick(candidates = fourteen, history = history, random = random))
                history.addFirst(PastRound(roundNumber = round, gameType = picked))
            }

            val counts = history.groupingBy { it.gameType }.eachCount()
            counts.keys == fourteen.toSet() && counts.values.all { it in 8..12 }
        }

        inside shouldBeGreaterThanOrEqual 90
    }
}
