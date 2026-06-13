package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.community.internal"])
class CommunityExceptionHandler {
    @ExceptionHandler(SlugUnavailableException::class, LastAdminException::class)
    fun conflict(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")

    @ExceptionHandler(CommunityAccessDeniedException::class, InviteNotFoundException::class)
    fun notFound(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")

    @ExceptionHandler(NotAdminException::class)
    fun forbidden(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message ?: "forbidden")

    @ExceptionHandler(InviteExpiredException::class)
    fun gone(e: RuntimeException) = ProblemDetail.forStatusAndDetail(HttpStatus.GONE, e.message ?: "gone")

    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(e: IllegalArgumentException) = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message ?: "bad request")
}
