package org.unividuell.countdown.core.iam.internal

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.util.AntPathMatcher
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

@ConfigurationProperties(prefix = "countdown.public-rate-limit")
data class PublicRateLimitProperties(val permitsPerMinute: Int = 20)

/**
 * A crude brake on the two endpoints anyone may call without a session.
 *
 * Why it exists: an invite code is six characters and the preview answers with a community name,
 * so without a brake the code space is walkable.
 *
 * Why the address does NOT come from X-Forwarded-For: Caddy *appends* to that header rather than
 * replacing it, and Spring's ForwardedHeaderFilter takes the FIRST entry — a value the client
 * itself can send, which would reset the counter on every request. `countdown-web` therefore sets
 * X-Client-IP from Caddy's own {client_ip}; remoteAddr is the local-development fallback.
 */
@Component
class PublicRateLimitFilter(
    private val properties: PublicRateLimitProperties,
    private val clock: Clock,
) : OncePerRequestFilter() {

    private class Window(val startedAt: Instant) {
        val hits = AtomicInteger()
    }

    private val matcher = AntPathMatcher()
    private val windows = ConcurrentHashMap<String, Window>()

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        GUARDED.none { matcher.match(it, request.requestURI) }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val now = clock.instant()

        // Self-limiting rather than evicting entry by entry: an attacker rotating addresses would
        // otherwise grow this map without bound. Dropping everything costs one forgiven minute.
        if (windows.size > MAX_TRACKED_CLIENTS) windows.clear()

        val window = windows.compute(clientIp(request)) { _, existing ->
            if (existing == null || Duration.between(existing.startedAt, now) >= WINDOW) Window(now) else existing
        }!!

        if (window.hits.incrementAndGet() > properties.permitsPerMinute) {
            response.status = HttpStatus.TOO_MANY_REQUESTS.value()
            return
        }

        filterChain.doFilter(request, response)
    }

    private fun clientIp(request: HttpServletRequest): String =
        request.getHeader("X-Client-IP")?.takeIf { it.isNotBlank() } ?: request.remoteAddr

    companion object {
        private val GUARDED = listOf("/api/preview/**", "/api/communities/join/*")
        private val WINDOW = Duration.ofMinutes(1)
        private const val MAX_TRACKED_CLIENTS = 10_000
    }
}
