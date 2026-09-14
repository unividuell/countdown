package org.unividuell.countdown.core.iam.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.security.autoconfigure.web.servlet.SecurityFilterProperties
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
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
 * X-Client-IP from Caddy's own {client_ip}; remoteAddr is the fallback when that header is
 * missing, which is always true on localhost but would otherwise fall straight back to the same
 * client-controlled value this comment just ruled out — losing X-Client-IP is not a safe default.
 */
// One order slot ahead of Spring Security's filter chain (DEFAULT_FILTER_ORDER), so a refused
// request never pays for session resolution, CSRF handling or authorization — the one job a
// brake has is to sit upstream of what it protects.
@Order(SecurityFilterProperties.DEFAULT_FILTER_ORDER - 1)
@Component
class PublicRateLimitFilter(
    private val properties: PublicRateLimitProperties,
    private val clock: Clock,
) : OncePerRequestFilter() {

    private val logger = KotlinLogging.logger {}

    private class Window(val startedAt: Instant) {
        val hits = AtomicInteger()
    }

    private val matcher = AntPathMatcher()
    private val windows = ConcurrentHashMap<String, Window>()

    // GET only: SecurityConfig opens GET without a session on both paths; the matching POST
    // (accepting an invite) already needs a session, so it is simply not counted here at all.
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        request.method != HttpMethod.GET.name() || GUARDED.none { matcher.match(it, request.requestURI) }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val now = clock.instant()
        val ip = clientIp(request)

        // Self-limiting rather than evicting entry by entry: an attacker rotating addresses would
        // otherwise grow this map without bound. Dropping everything costs one forgiven minute.
        if (windows.size > MAX_TRACKED_CLIENTS) windows.clear()

        val window = windows.compute(ip) { _, existing ->
            if (existing == null || Duration.between(existing.startedAt, now) >= WINDOW) Window(now) else existing
        }!!

        if (window.hits.incrementAndGet() > properties.permitsPerMinute) {
            logger.warn { "public rate limit exceeded for client '$ip'" }
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
