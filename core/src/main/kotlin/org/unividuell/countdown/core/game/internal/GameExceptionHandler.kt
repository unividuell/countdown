package org.unividuell.countdown.core.game.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.unividuell.countdown.core.game.InvalidGuessException

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.game.internal"])
class GameExceptionHandler {
    @ExceptionHandler(
        RoundAccessDeniedException::class,
        AssetNotFoundException::class,
        RoundNotFoundException::class,
    )
    fun notFound(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")

    @ExceptionHandler(InvalidGuessException::class)
    fun badRequest(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "invalid guess")

    @ExceptionHandler(AssetForbiddenException::class)
    fun forbidden(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message ?: "forbidden")

    @ExceptionHandler(
        NoGameToPlayException::class,
        NotRevealedException::class,
        AlreadyGuessedException::class,
        AlreadyRevealedException::class,
        RoundMovedOnException::class,
        StageMovedOnException::class,
    )
    fun conflict(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
}
