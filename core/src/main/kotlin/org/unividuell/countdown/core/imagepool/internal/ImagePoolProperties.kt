package org.unividuell.countdown.core.imagepool.internal

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * The quota promises `perCommunityLimit * maxBytes`, not `perCommunityLimit * 5 MB` -- raising
 * either shifts the backup's disk budget with it.
 */
@ConfigurationProperties(prefix = "imagepool")
data class ImagePoolProperties(
    val perCommunityLimit: Int = 150,
    val globalLimit: Int = 40,
    val maxBytes: Int = 15 * 1024 * 1024,
    val maxPixels: Long = 40_000_000,
    val thumbEdge: Int = 400,
)
