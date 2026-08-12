package org.unividuell.countdown.core.game.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.game.internal"])
class GameExceptionHandler {
    @ExceptionHandler(RoundAccessDeniedException::class)
    fun notFound(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")

    @ExceptionHandler(InvalidGuessException::class)
    fun badRequest(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "invalid guess")

    @ExceptionHandler(
        NoGameToPlayException::class,
        NotRevealedException::class,
        AlreadyGuessedException::class,
    )
    fun conflict(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
}
