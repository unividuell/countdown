package org.unividuell.countdown.core.gamelab.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.gamelab.internal"])
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabExceptionHandler {

    @ExceptionHandler(LabAccessDeniedException::class, UnknownLabGameException::class)
    fun notFound(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")

    @ExceptionHandler(AlreadyGuessedException::class)
    fun conflict(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "already guessed")

    @ExceptionHandler(InvalidGuessException::class)
    fun badRequest(e: RuntimeException) =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "invalid guess")
}
