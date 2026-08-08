package org.unividuell.countdown.core.guesshue.internal

/**
 * Any loading or rule violation. Deliberately a single exception type: it's only ever thrown at
 * application startup, where the message is the product — not a type anyone catches on.
 */
class GuessHueDatasetException(message: String) : IllegalStateException(message)
