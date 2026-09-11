package org.unividuell.countdown.core.iam.devauth

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.unividuell.countdown.core.iam.internal.devauth.FakeSignInGate

class FakeSignInGateTest {

    private val localEnvironment = MockEnvironment()
    private val stagingEnvironment = MockEnvironment().apply { setActiveProfiles("staging") }

    private fun gate(key: String, environment: MockEnvironment = localEnvironment) =
        FakeSignInGate(rawKey = key, environment = environment)

    @Test
    fun `an empty key is no lock at all`() {
        // The localhost default: multi-user testing means many browser profiles, and a lock
        // there would only cost typing.
        gate(key = "").isOpen(MockHttpServletRequest()) shouldBe true
        gate(key = "   ").isOpen(MockHttpServletRequest()) shouldBe true
    }

    @Test
    fun `a configured key locks a request without the cookie`() {
        gate(key = "open-sesame").isOpen(MockHttpServletRequest()) shouldBe false
    }

    @Test
    fun `a request carrying the cookie the gate itself issued is open`() {
        val gate = gate(key = "open-sesame")
        val response = MockHttpServletResponse()
        gate.unlock(request = MockHttpServletRequest(), response = response)

        val issued = response.getHeader("Set-Cookie")!!.substringAfter("=").substringBefore(";")
        val request = MockHttpServletRequest().apply {
            setCookies(Cookie(FakeSignInGate.COOKIE_NAME, issued))
        }

        gate.isOpen(request) shouldBe true
    }

    @Test
    fun `a cookie from a different key stays locked`() {
        val other = MockHttpServletResponse()
        gate(key = "another-key").unlock(request = MockHttpServletRequest(), response = other)
        val foreign = other.getHeader("Set-Cookie")!!.substringAfter("=").substringBefore(";")

        val request = MockHttpServletRequest().apply {
            setCookies(Cookie(FakeSignInGate.COOKIE_NAME, foreign))
        }

        gate(key = "open-sesame").isOpen(request) shouldBe false
    }

    @Test
    fun `the cookie carries the hash, never the key itself`() {
        // HttpOnly keeps JavaScript out, not the DevTools cookie panel — and screenshots travel.
        val response = MockHttpServletResponse()
        gate(key = "open-sesame").unlock(request = MockHttpServletRequest(), response = response)

        response.getHeader("Set-Cookie")!! shouldNotContain "open-sesame"
    }

    @Test
    fun `the cookie is scoped, long-lived and not readable by scripts`() {
        val response = MockHttpServletResponse()
        gate(key = "open-sesame").unlock(request = MockHttpServletRequest(), response = response)

        val header = response.getHeader("Set-Cookie")!!
        header.contains("Path=/login") shouldBe true
        header.contains("HttpOnly") shouldBe true
        header.contains("SameSite=Lax") shouldBe true
        header.contains("Max-Age=31536000") shouldBe true
        // MockHttpServletRequest is plain HTTP, so the Secure flag must be absent here — it is
        // driven by the request, not hard-coded, or localhost over http could never unlock.
        header.contains("Secure") shouldBe false
    }

    @Test
    fun `a secure request gets a secure cookie`() {
        val response = MockHttpServletResponse()
        val request = MockHttpServletRequest().apply { isSecure = true }
        gate(key = "open-sesame").unlock(request = request, response = response)

        response.getHeader("Set-Cookie")!!.contains("Secure") shouldBe true
    }

    @Test
    fun `accepts the configured key and nothing else`() {
        val gate = gate(key = "open-sesame")

        gate.accepts("open-sesame") shouldBe true
        gate.accepts("  open-sesame  ") shouldBe true
        gate.accepts("open-sesam") shouldBe false
        gate.accepts("") shouldBe false
    }

    @Test
    fun `without a key everything is accepted`() {
        gate(key = "").accepts("whatever") shouldBe true
    }

    @Test
    fun `staging refuses to start without a key`() {
        // Compose hands a missing variable through as an empty string, not as an error. Without
        // this check beta would stand open and look healthy doing it.
        val thrown = shouldThrow<IllegalStateException> {
            gate(key = "", environment = stagingEnvironment)
        }
        thrown.message!!.contains("FAKE_SIGN_IN_KEY") shouldBe true
    }

    @Test
    fun `staging starts with a key`() {
        gate(key = "open-sesame", environment = stagingEnvironment)
            .isOpen(MockHttpServletRequest()) shouldBe false
    }
}
