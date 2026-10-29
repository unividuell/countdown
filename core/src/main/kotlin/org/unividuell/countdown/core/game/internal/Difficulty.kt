package org.unividuell.countdown.core.game.internal

/**
 * How hard [roundNumber] should be for [gameType], from `0.0` to `1.0`.
 *
 * `0.0` the first time the game appears in the edition, however late: whoever meets a game for the
 * first time is learning it. After that the edition's progress, linear from its oldest played round
 * (`0.0`) to [gamesUntilRound] (`1.0`).
 *
 * ```
 * games from T-30 to T-0, the game first shows in T-12  -> 0.0
 * it shows again in T-6                                 -> (30 - 6) / (30 - 0) = 0.8
 * ```
 *
 * The oldest *played* round and not `gamesFromRound`: that bound may be open (`null`), and an
 * edition created mid-window starts with its first real round.
 *
 * [history] as `RoundGameStore.history` returns it: the rounds earlier than [roundNumber], numbers
 * ascending, so the last entry is the oldest round.
 */
fun difficultyOf(roundNumber: Int, gameType: String, history: List<PastRound>, gamesUntilRound: Int): Double {
    if (history.none { it.gameType == gameType }) return 0.0

    val first = history.last().roundNumber
    // A window moved up to the oldest played round or past it: nothing is left to climb.
    if (first <= gamesUntilRound) return 1.0

    return ((first - roundNumber).toDouble() / (first - gamesUntilRound)).coerceIn(0.0, 1.0)
}
