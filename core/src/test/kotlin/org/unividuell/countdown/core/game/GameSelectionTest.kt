package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.doubles.shouldBeBetween
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
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
            candidates = listOf("alpha", "beta"), history = emptyList(), weights = emptyMap(), random = random(),
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
                weights = emptyMap(), random = SeededRandom.fromSeed(it),
            ) shouldBe "beta"
        }
    }

    @Test
    fun `the rule is a preference - with one type it repeats rather than cancelling the game`() {
        val history = listOf(PastRound(roundNumber = 9, gameType = "alpha"))

        selection.pick(
            candidates = listOf("alpha"), history = history, weights = emptyMap(), random = random(),
        ) shouldBe "alpha"
    }

    @Test
    fun `no candidates means no game`() {
        selection.pick(candidates = emptyList(), history = emptyList(), weights = emptyMap(), random = random())
            .shouldBeNull()
    }

    @Test
    fun `with five candidates only the round immediately before blocks`() {
        // "beta" was two rounds ago: five candidates block one round, so it is fair game again.
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        val seen = (0 until 50).mapNotNull {
            selection.pick(
                candidates = listOf("alpha", "beta", "gamma", "delta", "epsilon"),
                history = history,
                weights = emptyMap(), random = SeededRandom.fromSeed(it),
            )
        }.toSet()

        seen shouldBe setOf("beta", "gamma", "delta", "epsilon")
    }

    @Test
    fun `with six candidates the last two rounds block`() {
        val history = listOf(
            PastRound(roundNumber = 9, gameType = "alpha"),
            PastRound(roundNumber = 10, gameType = "beta"),
        )

        val seen = (0 until 50).mapNotNull {
            selection.pick(
                candidates = listOf("alpha", "beta", "gamma", "delta", "epsilon", "zeta"),
                history = history,
                weights = emptyMap(), random = SeededRandom.fromSeed(it),
            )
        }.toSet()

        seen shouldBe setOf("gamma", "delta", "epsilon", "zeta")
    }

    @Test
    fun `the same random stream yields the same choice`() {
        val candidates = listOf("alpha", "beta", "gamma")

        val first = selection.pick(candidates = candidates, history = emptyList(), weights = emptyMap(), random = SeededRandom.fromSeed(99))
        val second = selection.pick(candidates = candidates, history = emptyList(), weights = emptyMap(), random = SeededRandom.fromSeed(99))

        first shouldBe second
    }

    @Test
    fun `it draws over all candidates, not just the first`() {
        // A rule that always returned candidates.first() would pass every test above. This one
        // fails unless the choice actually varies with the random stream.
        val candidates = listOf("alpha", "beta", "gamma")

        val seen = (0 until 50).mapNotNull {
            selection.pick(candidates = candidates, history = emptyList(), weights = emptyMap(), random = SeededRandom.fromSeed(it))
        }.toSet()

        seen shouldBe candidates.toSet()
    }

    private val fourteen = (1..14).map { "g%02d".format(it) }

    /** [types] most recent first, as `historyOf` returns them. */
    private fun historyOf(vararg types: String) =
        types.mapIndexed { i, type -> PastRound(roundNumber = 100 - i, gameType = type) }

    private fun picksOver(
        seeds: Int,
        history: List<PastRound>,
        weights: Map<String, GameWeight> = emptyMap(),
    ) = (0 until seeds).mapNotNull {
        selection.pick(candidates = fourteen, history = history, weights = weights, random = SeededRandom.fromSeed(it))
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
                val picked = requireNotNull(selection.pick(candidates = fourteen, history = history, weights = emptyMap(), random = random))
                history.addFirst(PastRound(roundNumber = round, gameType = picked))
            }

            val counts = history.groupingBy { it.gameType }.eachCount()
            counts.keys == fourteen.toSet() && counts.values.all { it in 8..12 }
        }

        inside shouldBeGreaterThanOrEqual 90
    }

    // Weights: stages are block lengths relative to the mean factor of the candidates.

    private fun allOn(weight: GameWeight) = fourteen.associateWith { weight }

    @Test
    fun `all games on one stage pick exactly as all normal`() {
        val history = historyOf(*fourteen.take(7).toTypedArray())

        listOf(GameWeight.OFTEN, GameWeight.RARE).forEach { stage ->
            (0 until 50).forEach { seed ->
                val weighted = selection.pick(
                    candidates = fourteen, history = history, weights = allOn(stage), random = SeededRandom.fromSeed(seed),
                )
                val plain = selection.pick(
                    candidates = fourteen, history = history, weights = emptyMap(), random = SeededRandom.fromSeed(seed),
                )

                weighted shouldBe plain
            }
        }
    }

    @Test
    fun `an off game is never picked`() {
        picksOver(seeds = 200, history = emptyList(), weights = mapOf("g01" to GameWeight.OFF)) shouldNotContain "g01"
    }

    @Test
    fun `all off falls back to every candidate`() {
        selection.pick(
            candidates = fourteen, history = emptyList(), weights = allOn(GameWeight.OFF), random = random(),
        ).shouldNotBeNull()
    }

    @Test
    fun `often shortens the block`() {
        // 13 normal + 1 often: mean factor 16/14, so often blocks round(10 * 16/14 / 3) = 4 rounds.
        val often = mapOf("g01" to GameWeight.OFTEN)

        picksOver(seeds = 200, history = historyOf("g02", "g03", "g04", "g05", "g01"), weights = often) shouldContain "g01"
        picksOver(seeds = 200, history = historyOf("g02", "g03", "g04", "g01"), weights = often) shouldNotContain "g01"
    }

    @Test
    fun `rare lengthens the block`() {
        // Mean factor (13 + 1/3) / 14: rare blocks 29 rounds, normal 10. g01 was 12 rounds ago —
        // free if it were normal, blocked as rare. g12, 11 rounds ago, is free again.
        val history = historyOf(*fourteen.drop(1).take(11).toTypedArray(), "g01")

        picksOver(seeds = 200, history = history, weights = mapOf("g01" to GameWeight.RARE)) shouldBe
            setOf("g12", "g13", "g14")
    }

    @Test
    fun `with nothing free it still avoids the previous round`() {
        // alpha rare blocks 2 rounds, beta normal 1: both blocked, beta was the round before.
        val history = historyOf("beta", "alpha")

        repeat(20) {
            selection.pick(
                candidates = listOf("alpha", "beta"),
                history = history,
                weights = mapOf("alpha" to GameWeight.RARE),
                random = SeededRandom.fromSeed(it),
            ) shouldBe "alpha"
        }
    }

    @Test
    fun `over 140 rounds often comes about twice, rare about half as often as normal`() {
        val weights = fourteen.take(3).associateWith { GameWeight.OFTEN } +
            fourteen.takeLast(3).associateWith { GameWeight.RARE }
        val counts = mutableMapOf<GameWeight, Int>()

        repeat(100) { seed ->
            val random = SeededRandom.fromSeed(seed)
            val history = ArrayDeque<PastRound>()

            repeat(140) { round ->
                val picked = requireNotNull(
                    selection.pick(candidates = fourteen, history = history, weights = weights, random = random),
                )
                history.addFirst(PastRound(roundNumber = round, gameType = picked))
            }

            history.forEach { counts.merge(weights[it.gameType] ?: GameWeight.NORMAL, 1, Int::plus) }
        }

        val normal = counts.getValue(GameWeight.NORMAL) / 8.0
        (counts.getValue(GameWeight.OFTEN) / 3.0 / normal).shouldBeBetween(1.8, 2.6, 0.0)
        (counts.getValue(GameWeight.RARE) / 3.0 / normal).shouldBeBetween(0.3, 0.55, 0.0)
    }
}
