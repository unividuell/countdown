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

/**
 * [used] and [limit] travel with the list so the page can say "12 von 150" before a pick.
 *
 * [viewerIsAdmin] is what the page needs to know whether the list it just got is the whole pool or
 * only the viewer's own uploads. Both the quota and the uploader's name are meaningless in the
 * second case -- a member counting their own rows against a pool-wide limit learns nothing, and
 * every name would be their own.
 */
data class ImageListResponse(
    val images: List<ImageResponse>,
    val used: Long,
    val limit: Int,
    val viewerIsAdmin: Boolean,
)
