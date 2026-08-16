package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.GameTypeHandle

/**
 * The community's current round, resolved — and, if it carries a game, materialised.
 *
 * All three endpoints resolve through the same function and then diverge: the announcement renders
 * this, revealing and guessing insist on [Announced] first. Without a shared type each of them would
 * repeat the membership check, the window check and the materialisation, and they would drift.
 */
sealed interface CurrentRound {

    /** [round] is `null` when there is no grid at all — no active run, or no target date. */
    data class NoGame(val round: Round?, val reason: NoGameReason) : CurrentRound

    data class Announced(
        val round: Round,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
    ) : CurrentRound
}
