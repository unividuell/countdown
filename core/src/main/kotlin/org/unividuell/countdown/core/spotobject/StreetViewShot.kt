package org.unividuell.countdown.core.spotobject

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * The frozen frame of a tip: a plain JPEG from the Street View **Static** API — no controls, no
 * movement, nothing to click.
 *
 * A `StreetViewPanorama` per tile was the obvious alternative and is the expensive one: each
 * constructed panorama object is a billed Dynamic Street View event, while the map's default
 * panorama (and this static image) are not. Whoever wants to look around follows the free Maps URL
 * into Google's own viewer instead.
 */
object StreetViewShot {

    /**
     * Signed server-side, because the signing secret must never reach a browser. The signature is
     * HMAC-SHA1 over path + query with the URL-safe-base64-decoded secret, URL-safe-base64
     * encoded — Google's documented algorithm, and it has to match byte for byte.
     */
    fun url(
        panoId: String,
        heading: Double,
        pitch: Double,
        fov: Double,
        width: Int,
        height: Int,
        apiKey: String,
        signingSecret: String,
    ): String {
        val query = listOf(
            "size" to "${width.coerceIn(16, 640)}x${height.coerceIn(16, 640)}",
            "pano" to panoId,
            "heading" to format(heading.coerceIn(-180.0, 360.0)),
            "pitch" to format(pitch.coerceIn(-90.0, 90.0)),
            "fov" to format(fov.coerceIn(MIN_FOV, MAX_FOV)),
            "key" to apiKey,
        ).joinToString("&") { (name, value) -> "$name=${encode(value)}" }

        val unsigned = "$PATH?$query"
        if (signingSecret.isBlank()) return "$HOST$unsigned"
        return "$HOST$unsigned&signature=${sign(path = unsigned, secret = signingSecret)}"
    }

    private fun sign(path: String, secret: String): String {
        val key = Base64.getUrlDecoder().decode(secret)
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        return Base64.getUrlEncoder().encodeToString(mac.doFinal(path.toByteArray(StandardCharsets.UTF_8)))
    }

    /** No exponent and no locale decimal comma — Google parses these as plain decimals. */
    private fun format(value: Double): String =
        if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private const val HOST = "https://maps.googleapis.com"
    private const val PATH = "/maps/api/streetview"
    private const val MIN_FOV = 10.0
    private const val MAX_FOV = 100.0
}
