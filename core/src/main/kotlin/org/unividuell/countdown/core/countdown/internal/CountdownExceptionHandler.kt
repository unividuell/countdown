package org.unividuell.countdown.core.countdown.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.countdown.internal"])
class CountdownExceptionHandler {
    @ExceptionHandler(CountdownAccessDeniedException::class)
    fun notFound(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
}
