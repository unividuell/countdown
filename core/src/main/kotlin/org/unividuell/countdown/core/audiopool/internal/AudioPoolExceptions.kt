package org.unividuell.countdown.core.audiopool.internal

/**
 * Every refusal carries a [code]. The server's own message stays English; the German sentence a
 * member reads is built in the frontend from this code, so one upload's failure can be named
 * precisely without shipping copy through the API.
 */
sealed class AudioPoolException(val code: String, message: String) : RuntimeException(message)

/** Not an active member (or the pool does not exist) -> 404, the same non-answer as elsewhere. */
class AudioPoolAccessDeniedException : AudioPoolException(code = "NO_ACCESS", message = "No access")
