package org.unividuell.countdown.core.iam

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import jakarta.servlet.DispatcherType
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.PublicRateLimitFilter
import org.unividuell.countdown.core.iam.internal.PublicRateLimitProperties
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Plain unit test, no Spring context: the MockMvc-based [PublicRateLimitFilterTest] never
 * advances time, so a bug in the window-rollover comparison would pass every test there and
 * lock every client out at the limit forever.
 */
class PublicRateLimitFilterUnitTest {

    private class MutableClock(private var now: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = now
        fun advance(duration: Duration) {
            now = now.plus(duration)
        }
    }

    private val clock = MutableClock(now = Instant.parse("2026-09-13T10:00:00Z"))
    private val filter = PublicRateLimitFilter(properties = PublicRateLimitProperties(permitsPerMinute = 2), clock = clock)

    // OncePerRequestFilter reads these on every call before it ever reaches our code; a relaxed
    // mock's own default answers are not reliable here (its "already filtered" check needs an
    // actual null, not just a relaxed placeholder), so both are stubbed explicitly.
    private fun request(ip: String) = mockk<HttpServletRequest>(relaxed = true) {
        every { method } returns "GET"
        every { requestURI } returns "/api/preview/"
        every { getHeader("X-Client-IP") } returns ip
        every { dispatcherType } returns DispatcherType.REQUEST
        every { getAttribute(any()) } returns null
    }

    private fun call(ip: String): Pair<HttpServletResponse, FilterChain> {
        val response = mockk<HttpServletResponse>(relaxed = true)
        val chain = mockk<FilterChain>(relaxed = true)
        filter.doFilter(request(ip = ip), response, chain)
        return response to chain
    }

    @Test
    fun `the window rolls over instead of locking a client out forever`() {
        call(ip = "203.0.113.20")
        call(ip = "203.0.113.20")
        val (refusedResponse, refusedChain) = call(ip = "203.0.113.20")
        verify { refusedResponse.status = 429 }
        verify(exactly = 0) { refusedChain.doFilter(any(), any()) }

        clock.advance(Duration.ofMinutes(1))

        val (allowedResponse, allowedChain) = call(ip = "203.0.113.20")
        verify(exactly = 0) { allowedResponse.status = 429 }
        verify(exactly = 1) { allowedChain.doFilter(any(), any()) }
    }
}
