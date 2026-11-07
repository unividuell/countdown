package org.unividuell.countdown.core.observability.internal

import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Two gauges for "who is here right now", both over the last [WINDOW]:
 *
 * - `countdown.users.online`   — signed-in sessions Spring Session touched (any page).
 * - `countdown.players.active` — signed-in users who hit a round endpoint
 *                                (`/api/communities/{slug}/rounds/…`), i.e. are playing.
 *
 * Runs after the security filter chain, so the authentication is already resolved.
 */
@Component
class ActivePlayers(
    private val clock: Clock,
    private val jdbc: JdbcClient,
    registry: MeterRegistry,
) : OncePerRequestFilter() {

    private val lastSeen = ConcurrentHashMap<String, Instant>()

    init {
        Gauge.builder("countdown.players.active") { activePlayers() }
            .description("Signed-in users with a round request in the last 5 minutes")
            .register(registry)

        Gauge.builder("countdown.users.online") { onlineUsers() }
            .description("Signed-in users with session activity in the last 5 minutes")
            .register(registry)
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (ROUND_PATH.matches(request.requestURI)) {
            signedInName()?.let { lastSeen[it] = clock.instant() }
        }
        chain.doFilter(request, response)
    }

    /** Also prunes, so the map never outgrows the players of the last five minutes. */
    fun activePlayers(): Int {
        val cutoff = clock.instant() - WINDOW
        lastSeen.entries.removeIf { it.value < cutoff }
        return lastSeen.size
    }

    private fun onlineUsers(): Int = jdbc
        .sql("SELECT count(DISTINCT principal_name) FROM spring_session WHERE principal_name IS NOT NULL AND last_access_time > :cutoff")
        .param("cutoff", (clock.instant() - WINDOW).toEpochMilli())
        .query(Int::class.java)
        .single()

    private fun signedInName(): String? = SecurityContextHolder.getContext().authentication
        ?.takeIf { it.isAuthenticated && it !is AnonymousAuthenticationToken }
        ?.name

    private companion object {
        val WINDOW: Duration = Duration.ofMinutes(5)
        val ROUND_PATH = Regex("^/api/communities/[^/]+/rounds/.*")
    }
}
