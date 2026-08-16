package org.unividuell.countdown.core.game.internal

/** Caller is not an ACTIVE member of the community → 404, so membership does not leak. */
class RoundAccessDeniedException(message: String = "No access") : RuntimeException(message)

/**
 * The current round carries no game — outside the window, no run, or a type this build lacks → 409.
 * The state is real and the request is well-formed; it simply cannot be played.
 */
class NoGameToPlayException(reason: NoGameReason) : RuntimeException("no game to play: $reason")

/**
 * Guessing before revealing → 409. Guessing a colour whose description one never saw is not a
 * meaningful request, and the clock hangs off the reveal.
 */
class NotRevealedException(message: String = "the round has not been revealed yet") : RuntimeException(message)

/** One guess per player and round → 409. Enforced by the `UPDATE`, not by a check. */
class AlreadyGuessedException(message: String = "already guessed in this round") : RuntimeException(message)

/**
 * A second reveal of a round that asked for a deliberate one → 409. Only games that answer `true` to
 * `GameType.requiresReveal` are strict here; for the others a reload is free and counted, not refused.
 */
class AlreadyRevealedException(message: String = "this round has already been revealed") :
    RuntimeException(message)

/**
 * The client guessed for a round that is no longer the current one → 409. Not an error to show: the
 * client refetches and renders the round that *is* current.
 */
class RoundMovedOnException(current: Int) :
    RuntimeException("the current round is now $current")
