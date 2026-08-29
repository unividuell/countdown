package org.unividuell.countdown.core.spotobject

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test

class StreetViewShotTest {

    @Test
    fun `the signed url carries the key, the panorama and a signature`() {
        val url = StreetViewShot.url(
            panoId = "abc", heading = 12.0, pitch = 0.0, fov = 90.0,
            width = 400, height = 300, apiKey = "KEY", signingSecret = "c2VjcmV0",
        )

        url shouldContain "pano=abc"
        url shouldContain "key=KEY"
        url shouldContain "signature="
        url shouldNotContain "c2VjcmV0"
    }

    /**
     * The signature is over path + query, HMAC-SHA1 with the URL-safe-base64-decoded secret, and
     * URL-safe-base64 encoded. Pinned against a known pair so a refactor cannot quietly change it.
     *
     * Expectation computed once, independently of the implementation:
     *   key = urlsafe_b64decode("c2VjcmV0")   # decodes to the ASCII bytes "secret" — a fake secret
     *   msg = "/maps/api/streetview?size=400x300&pano=abc&heading=12&pitch=0&fov=90&key=KEY"
     *   sig = urlsafe_b64encode(hmac_sha1(key, msg))  # -> "jMS3Ds_Qq5iTce2NDN366ekVg90="
     */
    @Test
    fun `the signature matches Google's documented algorithm`() {
        val url = StreetViewShot.url(
            panoId = "abc", heading = 12.0, pitch = 0.0, fov = 90.0,
            width = 400, height = 300, apiKey = "KEY", signingSecret = "c2VjcmV0",
        )

        url shouldBe "https://maps.googleapis.com/maps/api/streetview?size=400x300&pano=abc&heading=12" +
            "&pitch=0&fov=90&key=KEY&signature=jMS3Ds_Qq5iTce2NDN366ekVg90="
    }

    @Test
    fun `out-of-range angles are clamped rather than rejected`() {
        StreetViewShot.url(
            panoId = "abc", heading = 999.0, pitch = -999.0, fov = 1_000.0,
            width = 400, height = 300, apiKey = "K", signingSecret = "c2VjcmV0",
        ) shouldContain "pitch=-90"
    }

    /**
     * Both dimensions share the same [16, 640] clamp — this is what keeps the endpoint a thin
     * proxy for a fixed-size still rather than an arbitrary-size image fetcher.
     */
    @Test
    fun `image dimensions below the minimum are clamped up`() {
        StreetViewShot.url(
            panoId = "abc", heading = 0.0, pitch = 0.0, fov = 90.0,
            width = 1, height = 1, apiKey = "K", signingSecret = "c2VjcmV0",
        ) shouldContain "size=16x16"
    }

    @Test
    fun `image dimensions above the maximum are clamped down`() {
        StreetViewShot.url(
            panoId = "abc", heading = 0.0, pitch = 0.0, fov = 90.0,
            width = 99_999, height = 99_999, apiKey = "K", signingSecret = "c2VjcmV0",
        ) shouldContain "size=640x640"
    }

    @Test
    fun `image dimensions at the exact bounds pass through unchanged`() {
        StreetViewShot.url(
            panoId = "abc", heading = 0.0, pitch = 0.0, fov = 90.0,
            width = 16, height = 640, apiKey = "K", signingSecret = "c2VjcmV0",
        ) shouldContain "size=16x640"
    }
}
