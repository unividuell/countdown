package org.unividuell.countdown.core.audiopool.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Instant
import java.util.UUID

/** Immutable per id, and never shared: a year of caching, in this browser only. */
internal const val AUDIO_CACHE_CONTROL = "private, max-age=31536000, immutable"

/**
 * [uploadedBy] is the display name, not the id: an id would be useless on screen and would force a
 * second request. A user whose row is gone shows "?" rather than vanishing.
 */
data class AudioClipResponse(
    val id: UUID,
    val fileName: String,
    val durationMs: Long,
    val channels: Int,
    val byteSize: Int,
    val createdAt: Instant,
    val uploadedBy: String,
)

/**
 * [used] and [limit] travel with the list so the page can say "12 von 200" before a pick; [maxBytes]
 * lets the browser refuse an oversized WAV before sending it.
 *
 * [viewerIsAdmin] is what the page needs to know whether the list it just got is the whole pool or
 * only the viewer's own uploads. Both the quota and the uploader's name are meaningless in the
 * second case -- a member counting their own rows against a pool-wide limit learns nothing, and
 * every name would be their own.
 */
data class AudioListResponse(
    val clips: List<AudioClipResponse>,
    val used: Long,
    val limit: Int,
    val viewerIsAdmin: Boolean,
    val maxBytes: Int,
)

// The helpers below serve both controllers (community and super-admin), which differ only in the
// gate they ask.

internal fun namesFor(users: UserQuery, summaries: List<AudioClipSummary>): Map<UUID, String> =
    users.findAllById(summaries.map { it.uploadedBy }.distinct()).associate { it.id!! to it.username }

internal fun AudioClipSummary.toResponse(names: Map<UUID, String>) = AudioClipResponse(
    id = id,
    fileName = fileName,
    // Rounded down, so a clip never reads longer than it is: 72 000 frames at 48 kHz = 1500 ms.
    durationMs = frames * 1000L / sampleRate,
    channels = channels,
    byteSize = byteSize,
    createdAt = createdAt,
    // A clip whose uploader's row is gone stays listed rather than disappearing.
    uploadedBy = names[uploadedBy] ?: "?",
)

internal fun listResponse(
    users: UserQuery,
    service: AudioPoolService,
    pool: AudioPoolContext,
    viewerId: UUID,
): AudioListResponse {
    val summaries = service.list(pool = pool, viewerId = viewerId)
    val names = namesFor(users = users, summaries = summaries)
    return AudioListResponse(
        clips = summaries.map { it.toResponse(names) },
        used = service.count(pool),
        limit = service.limitOf(pool),
        viewerIsAdmin = pool.viewerIsAdmin,
        maxBytes = service.maxBytes(),
    )
}

/** No Content-Disposition on purpose: the browser plays the clip, it does not save it. */
internal fun wavResponse(bytes: ByteArray): ResponseEntity<ByteArray> =
    ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_TYPE, "audio/wav")
        .header(HttpHeaders.CACHE_CONTROL, AUDIO_CACHE_CONTROL)
        .body(bytes)
