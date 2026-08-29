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
    /** URL-signing secret for the Street View Static API. Server-side only, never sent anywhere. */
    val signingSecret: String = "",
)
