package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.GameTypeHandle
import java.util.UUID

/**
 * A round of a community, resolved — the running one, or a closed one from its history.
 *
 * All four endpoints resolve through the same function and then diverge: the announcement renders
 * this, revealing and guessing insist on [Announced] first, the history resolves a named round
 * against the running one. Without a shared type each of them would repeat the membership check,
 * the window check and the materialisation, and they would drift.
 */
sealed interface ResolvedRound {

    /** Whose round this is. Every consumer that draws a person needs it, and it is known before
     *  the round is: the gate resolves the community first. */
    val communityId: UUID

    /** The run the round hangs off. `null` only when the community has none — then there is no grid
     *  either, and nothing can be resolved against it. */
    val edition: CommunityEdition?

    /** `null` when there is no grid at all — no active run, or no target date. */
    val round: Round?

    /**
     * The next older announced round inside the run's window, or `null` for „ganz am Anfang“.
     *
     * Lives here rather than as a parameter of [RoundResponses.of] because all six response call
     * sites need it and none of them may forget it: the client replaces its whole round object with
     * every action response, so a pointer only on the `GET` would lose the history on the first
     * guess.
     */
    val previousRoundNumber: Int?

    data class NoGame(
        override val communityId: UUID,
        override val edition: CommunityEdition?,
        override val round: Round?,
        override val previousRoundNumber: Int?,
        val reason: NoGameReason,
    ) : ResolvedRound

    data class Announced(
        override val communityId: UUID,
        override val edition: CommunityEdition,
        override val round: Round,
        override val previousRoundNumber: Int?,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
        /**
         * Whether this round is over. Not a switch anybody answers per case — the announcement path
         * always passes `false`, the history path always `true` — but the one fact that decides
         * whether the visibility gates in [RoundResponses] are still holding anything back.
         */
        val closed: Boolean,
    ) : ResolvedRound
}
