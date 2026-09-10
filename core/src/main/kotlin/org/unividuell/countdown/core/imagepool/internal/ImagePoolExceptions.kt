package org.unividuell.countdown.core.imagepool.internal

/**
 * Every refusal carries a [code]. The server's own message stays English; the German sentence a
 * member reads is built in the frontend from this code, so one upload's failure can be named
 * precisely ("HEIC" vs. "pool full") without shipping copy through the API.
 */
sealed class ImagePoolException(val code: String, message: String) : RuntimeException(message)

/** Not an active member (or the pool does not exist) -> 404, the same non-answer as elsewhere. */
class ImagePoolAccessDeniedException : ImagePoolException(code = "NO_ACCESS", message = "No access")

/** An active member where an admin is required -> 403. */
class NotPoolAdminException : ImagePoolException(code = "NOT_ADMIN", message = "Admin required")

/** Wrong pool, wrong uploader, or simply absent -- all indistinguishable from outside -> 404. */
class ImageNotFoundException : ImagePoolException(code = "NOT_FOUND", message = "No such image")

class PoolFullException(limit: Int) :
    ImagePoolException(code = "POOL_FULL", message = "Pool holds at most $limit images")

class DuplicateImageException :
    ImagePoolException(code = "DUPLICATE", message = "This image is already in the pool")

class UnsupportedFormatException :
    ImagePoolException(code = "UNSUPPORTED_FORMAT", message = "Only JPEG, PNG, GIF and WebP")

class HeicNotSupportedException :
    ImagePoolException(code = "HEIC_UNSUPPORTED", message = "HEIC cannot be read")

class ImageTooLargeException(maxBytes: Int) :
    ImagePoolException(code = "TOO_LARGE", message = "At most $maxBytes bytes")

class TooManyPixelsException(maxPixels: Long) :
    ImagePoolException(code = "TOO_MANY_PIXELS", message = "At most $maxPixels pixels")

class BrokenImageException :
    ImagePoolException(code = "BROKEN_IMAGE", message = "The file could not be decoded")
