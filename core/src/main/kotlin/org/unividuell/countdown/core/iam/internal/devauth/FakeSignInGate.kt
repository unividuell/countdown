package org.unividuell.countdown.core.iam.internal.devauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.security.MessageDigest
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component

/**
 * The lock in front of the fake sign-in. Staging runs the real datasets on a public URL, so the
 * picker — the only door into staging — asks for a key once per browser profile.
 *
 * Gated like everything in `devauth`: profile plus flag. With the fake sign-in switched off there
 * is nothing to lock, which is why the lock disappears with it.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.test-auth.enabled")
class FakeSignInGate(
    @Value("\${app.test-auth.key:}") rawKey: String,
    environment: Environment,
) {
    /** Trimmed and blank-folded once, here: "no key" must mean the same thing to every caller. */
    private val key: String? = rawKey.trim().ifBlank { null }

    /** What a browser must present. Never the key itself — see [unlock]. */
    private val expected: String? = key?.let(::sha256Hex)

    init {
        val locked = environment.activeProfiles.filter { it in LOCKED_PROFILES }
        check(key != null || locked.isEmpty()) {
            "app.test-auth.key is empty under profile(s) ${locked.joinToString()} — set FAKE_SIGN_IN_KEY. " +
                "Refusing to start: Compose passes a missing variable through as an empty string, so an " +
                "unlocked fake sign-in would hand out every round's solution and look healthy doing it."
        }
    }

    /** No key configured means no lock — the localhost default. */
    fun isOpen(request: HttpServletRequest): Boolean {
        val expected = expected ?: return true
        val presented = request.cookies?.firstOrNull { it.name == COOKIE_NAME }?.value ?: return false
        return constantTimeEquals(presented, expected)
    }

    /** Whether a typed-in candidate is the configured key. Compared as hashes, so equal length. */
    fun accepts(candidate: String): Boolean {
        val expected = expected ?: return true
        return constantTimeEquals(sha256Hex(candidate.trim()), expected)
    }

    /**
     * Issues the cookie. It holds the key's **hash**: `HttpOnly` keeps JavaScript out but not the
     * DevTools cookie panel, and a development machine's screenshots travel. Against a stolen
     * cookie this does nothing — that opens the door either way; it protects the key, not the door.
     *
     * `Path=/login` because nowhere else reads it, so nowhere else should carry it. `Secure` comes
     * from the request (correct behind `forward-headers-strategy: framework`), or plain-HTTP
     * localhost could never unlock at all.
     */
    fun unlock(request: HttpServletRequest, response: HttpServletResponse) {
        val value = expected ?: return
        val cookie = ResponseCookie.from(COOKIE_NAME, value)
            .path("/login")
            .httpOnly(true)
            .secure(request.isSecure)
            .sameSite("Lax")
            .maxAge(Duration.ofDays(365))
            .build()

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString())
    }

    private fun constantTimeEquals(a: String, b: String) =
        MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))

    private fun sha256Hex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString(separator = "") { "%02x".format(it) }

    companion object {
        const val COOKIE_NAME = "countdown_fake_sign_in"

        /**
         * `production` is deliberately absent: the fake sign-in does not exist there at all
         * (`@Profile("!production")`). A line that can never fire would claim a protection it
         * does not provide.
         */
        private val LOCKED_PROFILES = setOf("staging")
    }
}
