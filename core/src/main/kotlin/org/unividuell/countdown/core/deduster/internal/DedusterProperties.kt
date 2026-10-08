package org.unividuell.countdown.core.deduster.internal

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * The frozen play image: ~300–500 KB a round at these values, kept for good — a round must not
 * change when its pool image does.
 */
@ConfigurationProperties(prefix = "deduster")
data class DedusterProperties(
    val playImageEdge: Int = 1600,
    val playImageQuality: Double = 0.82,
)
