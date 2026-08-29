package org.unividuell.countdown.core.spotobject.internal

import org.springframework.boot.context.properties.ConfigurationProperties
import java.util.Base64

@ConfigurationProperties(prefix = "app.spot-object")
open class SpotObjectProperties(
    /**
     * Absolute path to the **decrypted** term list the deployment mounts into the container. Empty
     * means: the sample from the classpath — a startup abort in a deployed environment, see
     * [SpotObjectConfiguration].
     */
    val termsPath: String = "",
    /** Browser key for the Maps JavaScript API. Referrer-restricted; the client is told this one. */
    val mapsApiKey: String = "",
    /**
     * Key for the backend's own server-to-server calls (Street View metadata, Geocoding — see
     * [GoogleCountryLookup][org.unividuell.countdown.core.spotobject.internal.GoogleCountryLookup]).
     * Never sent to a client. A referrer-restricted key rejects these calls outright — they carry
     * no `Referer` header — so this must be a separate credential from [mapsApiKey], restricted by
     * IP instead.
     */
    val serverMapsApiKey: String = "",
    /** URL-signing secret for the Street View Static API. Server-side only, never sent anywhere. */
    val signingSecret: String = "",
) {
    init {
        // Decoded once, while the properties bind, rather than on every signature: a malformed
        // secret would otherwise throw inside `StreetViewShot.sign` — one 500 per review tile — on
        // a deployment that looks healthy, while every other misconfiguration here refuses the
        // boot. The value itself stays out of the message; only its shape is the complaint.
        if (signingSecret.isNotBlank()) {
            try {
                Base64.getUrlDecoder().decode(signingSecret)
            } catch (_: IllegalArgumentException) {
                throw SpotObjectException(
                    "app.spot-object.signing-secret is not URL-safe base64. Google hands the secret " +
                        "out in that alphabet; a value carrying '+' or '/' has to be converted first. " +
                        "Refusing to start: signing would otherwise fail once per image request.",
                )
            }
        }
    }
}
