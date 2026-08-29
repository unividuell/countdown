package org.unividuell.countdown.core.spotobject.internal

import org.springframework.boot.context.properties.ConfigurationProperties

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
)
