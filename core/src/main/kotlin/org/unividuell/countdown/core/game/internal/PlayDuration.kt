package org.unividuell.countdown.core.game.internal

import java.time.Duration
import java.time.Instant

/**
 * From the reveal that started the clock to the guess that stopped it.
 *
 * One function for two callers on purpose: `PlayService` turns it into the round's `deviation` and
 * `RoundResponses` publishes it as `durationMs`. Two copies of this subtraction would be two chances
 * for the number that decides the round to differ from the number the scoreboard prints.
 */
fun durationMsBetween(revealedAt: Instant, guessedAt: Instant): Long =
    Duration.between(revealedAt, guessedAt).toMillis()
