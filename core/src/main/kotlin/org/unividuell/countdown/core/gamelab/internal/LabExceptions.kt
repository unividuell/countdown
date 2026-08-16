package org.unividuell.countdown.core.gamelab.internal

/** Unknown community, or the caller is not an active member -> 404 (the two must be indistinguishable). */
class LabAccessDeniedException(message: String = "No access") : RuntimeException(message)

/** No lab game registered under that id -> 404. */
class UnknownLabGameException(message: String) : RuntimeException(message)

/** One guess per player and round, as in the real game -> 409. Use a reset action to play again. */
class AlreadyGuessedException(message: String = "already guessed in this round") : RuntimeException(message)
