package org.unividuell.countdown.core.spotobject.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.spotobject.StreetViewShot

/** What the browser needs in order to draw a map at all. Referrer-restricted, hence handed out. */
data class SpotObjectConfigDto(val mapsApiKey: String)

/**
 * This module's own HTTP surface, the way `songsnippet` has one.
 *
 * The still image is a **redirect**, not a URL in a DTO: the only per-play, game-shaped exit the
 * framework offers is `Judgement.outcome`, and that is persisted at judge time — an API key and an
 * HMAC frozen into every historical round is a worse trade than one extra hop. The signing secret
 * stays here either way, which was the actual requirement.
 */
@RestController
@RequestMapping("/api/spot-object")
class SpotObjectController(private val properties: SpotObjectProperties) {

    @GetMapping("/config")
    fun config() = SpotObjectConfigDto(mapsApiKey = properties.mapsApiKey)

    /**
     * A tip's frozen frame. Cached privately and long: the same six parameters always denote the
     * same photograph, and every tile on the review grid asks for one.
     *
     * Deliberately the **browser** key, not the server one: the browser itself follows this
     * redirect (an `<img>` on our page), so the request Google sees carries our own origin as
     * `Referer` — exactly what the browser key's referrer restriction expects. The server key,
     * called with no `Referer` at all, would be rejected here the same way it would in
     * `GoogleCountryLookup`.
     */
    @GetMapping("/shot")
    fun shot(
        @RequestParam pano: String,
        @RequestParam(defaultValue = "0") heading: Double,
        @RequestParam(defaultValue = "0") pitch: Double,
        @RequestParam(defaultValue = "90") fov: Double,
        @RequestParam(name = "w", defaultValue = "400") width: Int,
        @RequestParam(name = "h", defaultValue = "300") height: Int,
    ): ResponseEntity<Void> = ResponseEntity.status(302)
        .header(
            HttpHeaders.LOCATION,
            StreetViewShot.url(
                panoId = pano, heading = heading, pitch = pitch, fov = fov,
                width = width, height = height,
                apiKey = properties.mapsApiKey, signingSecret = properties.signingSecret,
            ),
        )
        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400, immutable")
        .build()
}
