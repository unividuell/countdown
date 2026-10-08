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
    /**
     * Must stay <= `spring.servlet.multipart.max-file-size` in application.yaml, or an upload dies
     * in the multipart parser before this limit is checked. An override is plain bytes, not "15MB":
     * the target is an Int, and Boot's DataSize converters only fire for a DataSize target.
     */
    val maxBytes: Int = 15 * 1024 * 1024,
    val maxPixels: Long = 40_000_000,
    val thumbEdge: Int = 400,
)
