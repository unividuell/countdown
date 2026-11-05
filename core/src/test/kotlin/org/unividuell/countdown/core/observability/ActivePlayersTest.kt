package org.unividuell.countdown.core.observability

import io.kotest.matchers.shouldBe
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.DispatcherType
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.authentication.TestingAuthenticationToken
import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.core.context.SecurityContextHolder
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class ActivePlayersTest {

    private class MutableClock(var now: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = now
    }

    private val clock = MutableClock(now = Instant.parse("2026-11-05T20:00:00Z"))
    private val players = ActivePlayers(clock = clock, jdbc = mockk(), registry = SimpleMeterRegistry())

    @AfterEach
    fun clearContext() = SecurityContextHolder.clearContext()

    // OncePerRequestFilter needs a real null from getAttribute, not a relaxed placeholder.
    private fun hit(path: String, user: String?) {
        SecurityContextHolder.getContext().authentication = when (user) {
            null -> AnonymousAuthenticationToken("key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"))
            else -> TestingAuthenticationToken(user, null, "ROLE_USER")
        }
        val request = mockk<HttpServletRequest>(relaxed = true) {
            every { requestURI } returns path
            every { dispatcherType } returns DispatcherType.REQUEST
            every { getAttribute(any()) } returns null
        }
        players.doFilter(request, mockk<HttpServletResponse>(relaxed = true), mockk<FilterChain>(relaxed = true))
    }

    @Test
    fun `counts distinct signed-in users on round endpoints only`() {
        hit(path = "/api/communities/a/rounds/current", user = "fry")
        hit(path = "/api/communities/a/rounds/current/guess", user = "fry")
        hit(path = "/api/communities/b/rounds/3", user = "leela")
        hit(path = "/api/communities/a/rounds/current", user = null)
        hit(path = "/api/me", user = "bender")

        players.activePlayers() shouldBe 2
    }

    @Test
    fun `a player drops out five minutes after the last round request`() {
        hit(path = "/api/communities/a/rounds/current", user = "fry")

        clock.now += Duration.ofMinutes(4)
        players.activePlayers() shouldBe 1

        clock.now += Duration.ofMinutes(2)
        players.activePlayers() shouldBe 0
    }
}
