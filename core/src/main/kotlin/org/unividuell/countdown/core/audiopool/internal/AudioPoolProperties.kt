package org.unividuell.countdown.core.audiopool.internal

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * The quota promises `perCommunityLimit * maxBytes` -- raising either shifts the backup's disk
 * budget with it.
 */
@ConfigurationProperties(prefix = "audiopool")
data class AudioPoolProperties(
    val perCommunityLimit: Int = 200,
    val globalLimit: Int = 50,
    /**
     * Must stay <= `spring.servlet.multipart.max-file-size` in application.yaml, or an upload dies
     * in the multipart parser before this limit is checked. An override is plain bytes, not "5MB":
     * the target is an Int, and Boot's DataSize converters only fire for a DataSize target.
     */
    val maxBytes: Int = 5 * 1024 * 1024,
)
