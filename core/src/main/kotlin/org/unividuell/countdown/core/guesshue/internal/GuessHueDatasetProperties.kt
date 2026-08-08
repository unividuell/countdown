package org.unividuell.countdown.core.guesshue.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app.guess-hue")
open class GuessHueDatasetProperties(
    /**
     * Absolute path to the **decrypted** production dataset that the deployment mounts into the
     * container. Empty means: sample from the classpath — a startup abort in a deployed
     * environment, see `GuessHueDatasetConfiguration`.
     */
    val datasetPath: String = "",
)
