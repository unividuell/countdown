package org.unividuell.countdown.core.audiopool.internal

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * Plain class, like imagepool's Image: ByteArray equality is identity, and nothing ever compares
 * two clips. [communityId] null means the global pool.
 */
@Table(schema = "audiopool", name = "clips")
class AudioClip(
    @Id
    val id: UUID? = null,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val fileName: String,
    val channels: Int,
    val sampleRate: Int,
    val frames: Int,
    val byteSize: Int,
    val sha256: ByteArray,
    val bytes: ByteArray,
    @CreatedDate
    val createdAt: Instant? = null,
)
