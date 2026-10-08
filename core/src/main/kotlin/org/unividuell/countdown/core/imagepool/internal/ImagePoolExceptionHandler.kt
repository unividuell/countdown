package org.unividuell.countdown.core.imagepool.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.imagepool.internal"])
class ImagePoolExceptionHandler {

    @ExceptionHandler(ImagePoolException::class)
    fun handle(e: ImagePoolException): ProblemDetail {
        val status = when (e) {
            is ImagePoolAccessDeniedException, is ImageNotFoundException -> HttpStatus.NOT_FOUND
            is NotPoolAdminException -> HttpStatus.FORBIDDEN
            is PoolFullException, is DuplicateImageException -> HttpStatus.CONFLICT
            is UnsupportedFormatException, is HeicNotSupportedException -> HttpStatus.UNSUPPORTED_MEDIA_TYPE
            // RFC 9110 renamed 413/422; the PAYLOAD_TOO_LARGE/UNPROCESSABLE_ENTITY constants
            // still exist but are deprecated in this Spring version.
            is ImageTooLargeException -> HttpStatus.CONTENT_TOO_LARGE
            is TooManyPixelsException, is BrokenImageException -> HttpStatus.UNPROCESSABLE_CONTENT
        }
        return ProblemDetail.forStatusAndDetail(status, e.message ?: e.code)
            .apply { setProperty("code", e.code) }
    }

    /** The container rejects an oversized body before the service ever sees it -- same code. */
    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun tooLarge(e: MaxUploadSizeExceededException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, "Upload exceeds the configured limit")
            .apply { setProperty("code", "TOO_LARGE") }
}
