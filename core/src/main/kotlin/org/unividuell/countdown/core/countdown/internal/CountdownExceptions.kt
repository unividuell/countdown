package org.unividuell.countdown.core.countdown.internal

/** Unknown community, or caller is not an ACTIVE member -> 404 (no info leak between the two cases). */
class CountdownAccessDeniedException(message: String = "No access") : RuntimeException(message)
