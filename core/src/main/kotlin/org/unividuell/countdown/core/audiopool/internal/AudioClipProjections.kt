package org.unividuell.countdown.core.audiopool.internal

import java.time.Instant
import java.util.UUID

/**
 * The listing view, and the reason it is a type of its own: it CANNOT carry bytes. A repository
 * method returning [AudioClip] would load every WAV for a screen that shows file names.
 */
data class AudioClipSummary(
    val id: UUID,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val fileName: String,
    val channels: Int,
    val sampleRate: Int,
    val frames: Int,
    val byteSize: Int,
    val createdAt: Instant,
)

/**
 * One-property carrier for [AudioClipRepository.findWav]'s query. A bare `ByteArray` return type
 * cannot be used directly: Spring Data treats every array as collection-like, so it would read
 * the query as one row per byte instead of one row containing a blob.
 */
class WavBytes(val bytes: ByteArray)
