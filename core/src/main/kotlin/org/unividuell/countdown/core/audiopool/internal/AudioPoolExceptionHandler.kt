package org.unividuell.countdown.core.audiopool.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.audiopool.internal"])
class AudioPoolExceptionHandler {

    @ExceptionHandler(AudioPoolException::class)
    fun handle(e: AudioPoolException): ProblemDetail {
        val status = when (e) {
            is AudioPoolAccessDeniedException, is AudioClipNotFoundException -> HttpStatus.NOT_FOUND
            is AudioPoolFullException, is DuplicateAudioException -> HttpStatus.CONFLICT
            is UnsupportedAudioFormatException -> HttpStatus.UNSUPPORTED_MEDIA_TYPE
            // RFC 9110 renamed 413/422; the PAYLOAD_TOO_LARGE/UNPROCESSABLE_ENTITY constants
            // still exist but are deprecated in this Spring version.
            is AudioTooLargeException -> HttpStatus.CONTENT_TOO_LARGE
            is BrokenAudioException -> HttpStatus.UNPROCESSABLE_CONTENT
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
