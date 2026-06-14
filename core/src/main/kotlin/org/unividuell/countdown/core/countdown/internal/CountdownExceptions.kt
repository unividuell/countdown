package org.unividuell.countdown.core.countdown.internal

/** Caller is not an ACTIVE member of the community -> 404 (no info leak). */
class CountdownAccessDeniedException(message: String = "No access") : RuntimeException(message)
