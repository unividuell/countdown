package org.unividuell.countdown.core.spotobject

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.spotobject.internal.SpotObjectException
import org.unividuell.countdown.core.spotobject.internal.SpotObjectProperties

/**
 * A signing secret that is not URL-safe base64 used to surface as an `IllegalArgumentException`
 * inside `StreetViewShot.sign` — a 500 per review tile, on a deployment that otherwise looks
 * healthy. Every other misconfiguration in this module refuses the boot; so does this one now.
 */
class SpotObjectSigningSecretFailFastTest {

    @Test
    fun `a secret that is not URL-safe base64 refuses the boot, without naming the value`() {
        val thrown = shouldThrow<SpotObjectException> {
            // '+' and '/' are what a value pasted from the standard alphabet carries.
            SpotObjectProperties(signingSecret = "not+url/safe")
        }

        thrown.message!! shouldContain "signing-secret"
        thrown.message!! shouldNotContain "not+url/safe"
    }

    @Test
    fun `a well-formed secret and an absent one both pass`() {
        shouldNotThrowAny {
            SpotObjectProperties(signingSecret = "c2VrcmV0bWFya2Vy")
            SpotObjectProperties(signingSecret = "")
        }
    }
}
