package org.unividuell.countdown.core.imagepool.internal

import java.time.Instant
import java.util.UUID

/**
 * [uploadedBy] is the display name, not the id: an id would be useless on screen and would force a
 * second request. A membership whose user row is gone shows "?" rather than vanishing.
 */
data class ImageResponse(
    val id: UUID,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val createdAt: Instant,
    val uploadedBy: String,
)

/** [used] and [limit] travel with the list so the page can say "12 von 150" before a pick. */
data class ImageListResponse(val images: List<ImageResponse>, val used: Long, val limit: Int)
