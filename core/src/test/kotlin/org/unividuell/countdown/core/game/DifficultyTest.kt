package org.unividuell.countdown.core.game

import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.PastRound
import org.unividuell.countdown.core.game.internal.difficultyOf

class DifficultyTest {

    /** Rounds [range] ascending, as `RoundGameStore.history` returns them; [pairs] override the type. */
    private fun h(range: IntRange, vararg pairs: Pair<Int, String>): List<PastRound> {
        val special = pairs.toMap()
        return range.map { PastRound(roundNumber = it, gameType = special[it] ?: "guess-hue") }
    }

    @Test
    fun `the first appearance of a game in the edition is 0, however late`() {
        difficultyOf(
            roundNumber = 12,
            gameType = "echo-locate",
            history = h(13..30),
            gamesUntilRound = 0,
        ) shouldBe 0.0
    }

    @Test
    fun `later appearances run linearly from the oldest played round to gamesUntilRound`() {
        // T-30 .. T-0: first game in T-30, this game seen in T-12, now T-6 -> (30 - 6) / 30.
        difficultyOf(
            roundNumber = 6,
            gameType = "echo-locate",
            history = h(7..30, 12 to "echo-locate"),
            gamesUntilRound = 0,
        ) shouldBe (0.8 plusOrMinus 1e-9)
    }

    @Test
    fun `an edition created mid-window starts at its oldest played round`() {
        difficultyOf(
            roundNumber = 10,
            gameType = "echo-locate",
            history = h(11..20, 15 to "echo-locate"),
            gamesUntilRound = 0,
        ) shouldBe (0.5 plusOrMinus 1e-9)
    }

    @Test
    fun `it is clamped to 1`() {
        difficultyOf(
            roundNumber = 3,
            gameType = "echo-locate",
            history = h(4..20, 10 to "echo-locate"),
            gamesUntilRound = 5,
        ) shouldBe 1.0
    }

    @Test
    fun `it is 1 when gamesUntilRound has been raised past the oldest played round`() {
        // oldest = 8, until = 9: the denominator would be negative.
        difficultyOf(
            roundNumber = 3,
            gameType = "echo-locate",
            history = h(4..8, 6 to "echo-locate"),
            gamesUntilRound = 9,
        ) shouldBe 1.0
    }
}
