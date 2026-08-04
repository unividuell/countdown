package org.unividuell.countdown.core.iam.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.iam.internal"])
class IamExceptionHandler {
    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(e: IllegalArgumentException) = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "bad request")

    @ExceptionHandler(StaleSessionException::class)
    fun unauthorized(e: StaleSessionException) = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.message ?: "unauthorized")

    @ExceptionHandler(UserNotFoundException::class)
    fun notFound(e: UserNotFoundException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
}
