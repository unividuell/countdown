package org.unividuell.countdown.core.game.internal

/**
 * How hard [roundNumber] should be for [gameType], from `0.0` to `1.0`.
 *
 * `0.0` the first time the game appears in the edition, however late: whoever meets a game for the
 * first time is learning it. After that the edition's progress, linear from its oldest played round
 * (`0.0`) to [phaseTwoStartRound] (`1.0`) — the final stretch is played at full difficulty. Without
 * phase two, to [gamesUntilRound].
 *
 * ```
 * games from -30 to 0, phase two from -5, the game first shows in -12  -> 0.0
 * it shows again in -10                    -> (-10 - -30) / (-5 - -30) = 0.8
 * and in -5 or later                       -> 1.0
 * ```
 *
 * The oldest *played* round and not `gamesFromRound`: an edition created mid-window starts with
 * its first real round.
 *
 * [history] as `RoundGameStore.history` returns it: the rounds earlier than [roundNumber], numbers
 * descending, so the last entry is the oldest round.
 */
fun difficultyOf(
    roundNumber: Int,
    gameType: String,
    history: List<PastRound>,
    phaseTwoStartRound: Int?,
    gamesUntilRound: Int,
): Double {
    if (history.none { it.gameType == gameType }) return 0.0

    val first = history.last().roundNumber
    val hardest = phaseTwoStartRound ?: gamesUntilRound
    // The top moved back to the oldest played round or before it: nothing is left to climb.
    if (first >= hardest) return 1.0

    return ((roundNumber - first).toDouble() / (hardest - first)).coerceIn(0.0, 1.0)
}
