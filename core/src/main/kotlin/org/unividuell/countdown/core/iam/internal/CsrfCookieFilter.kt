package org.unividuell.countdown.core.iam.internal

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Materialises the deferred [CsrfToken] on every request so the
 * `CookieCsrfTokenRepository` writes the `XSRF-TOKEN` cookie.
 *
 * With Spring Security's deferred CSRF loading, the cookie is only written once the
 * token value is actually read. A plain `GET` (e.g. the SPA's `/api/me` bootstrap)
 * never reads it, so the SPA would have no cookie to echo as `X-XSRF-TOKEN` and
 * mutating requests (`POST /logout`) would get 403. Reading the token here forces
 * the cookie to be set.
 */
class CsrfCookieFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val csrfToken = request.getAttribute(CsrfToken::class.java.name) as? CsrfToken
        // Reading the token value renders it, triggering the repository to set the cookie.
        csrfToken?.token
        filterChain.doFilter(request, response)
    }
}
