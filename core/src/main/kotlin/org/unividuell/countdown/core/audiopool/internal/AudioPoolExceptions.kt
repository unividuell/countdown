package org.unividuell.countdown.core.audiopool.internal

/**
 * Every refusal carries a [code]. The server's own message stays English; the German sentence a
 * member reads is built in the frontend from this code, so one upload's failure can be named
 * precisely without shipping copy through the API.
 */
sealed class AudioPoolException(val code: String, message: String) : RuntimeException(message)

/** Not an active member (or the pool does not exist) -> 404, the same non-answer as elsewhere. */
class AudioPoolAccessDeniedException : AudioPoolException(code = "NO_ACCESS", message = "No access")

/** Wrong pool, wrong uploader, or simply absent -- all indistinguishable from outside -> 404. */
class AudioClipNotFoundException : AudioPoolException(code = "NOT_FOUND", message = "No such audio clip")

class AudioPoolFullException(limit: Int) :
    AudioPoolException(code = "POOL_FULL", message = "Pool holds at most $limit clips")

class DuplicateAudioException :
    AudioPoolException(code = "DUPLICATE", message = "This audio is already in the pool")

class UnsupportedAudioFormatException :
    AudioPoolException(code = "UNSUPPORTED_FORMAT", message = "Only 16-bit PCM WAV, mono or stereo, 8 to 96 kHz")

class AudioTooLargeException(maxBytes: Int) :
    AudioPoolException(code = "TOO_LARGE", message = "At most $maxBytes bytes")

class BrokenAudioException :
    AudioPoolException(code = "BROKEN_AUDIO", message = "The file header could not be read")
