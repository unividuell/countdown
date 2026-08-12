package org.unividuell.countdown.core.game.internal

/** Caller is not an ACTIVE member of the community → 404, so membership does not leak. */
class RoundAccessDeniedException(message: String = "No access") : RuntimeException(message)

/**
 * The game rejected the guess's shape or range → 400. Thrown by `judge` before anything is
 * persisted: a typo must not consume the player's single attempt.
 */
class InvalidGuessException(message: String) : RuntimeException(message)
