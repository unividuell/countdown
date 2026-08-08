package org.unividuell.countdown.core.guesshue.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app.guess-hue")
open class GuessHueDatasetProperties(
    /**
     * Absoluter Pfad auf das **entschlüsselte** Produktionsdatenset, das das Deployment in den
     * Container mountet. Leer bedeutet: Beispiel aus dem Classpath — im Betrieb ein Startabbruch,
     * siehe `GuessHueDatasetConfiguration`.
     */
    val datasetPath: String = "",
)
