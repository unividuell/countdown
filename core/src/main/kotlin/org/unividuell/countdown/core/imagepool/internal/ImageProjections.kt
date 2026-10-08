package org.unividuell.countdown.core.imagepool.internal

import java.time.Instant
import java.util.UUID

/**
 * The listing view, and the reason it is a type of its own: it CANNOT carry bytes. A repository
 * method returning [Image] would load all columns -- 150 rows of originals is 750 MB of heap for
 * a screen that shows thumbnails.
 */
data class ImageSummary(
    val id: UUID,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val mediaType: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val createdAt: Instant,
)

/** One image's bytes with the type needed to serve them. Plain class: see [Image]. */
class ImageBytes(val mediaType: String, val bytes: ByteArray)

/**
 * One-property carrier for [ImageRepository.findThumb]'s query. A bare `ByteArray` return type
 * cannot be used directly: Spring Data treats every array as collection-like, so it would read
 * the query as one row per byte instead of one row containing a blob. Routing through this
 * projection (as [ImageBytes] already does for two columns) sidesteps that.
 */
class ThumbBytes(val thumbBytes: ByteArray)
