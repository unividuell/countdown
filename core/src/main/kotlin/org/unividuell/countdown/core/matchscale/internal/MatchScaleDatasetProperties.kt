package org.unividuell.countdown.core.matchscale.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app.match-scale")
open class MatchScaleDatasetProperties(
    /**
     * Directory with the **decrypted** category files the deployment mounts into the container.
     * Empty means: the sample from the classpath — a startup abort in a deployed environment, see
     * [MatchScaleDatasetConfiguration].
     */
    val datasetDir: String = "",
)
