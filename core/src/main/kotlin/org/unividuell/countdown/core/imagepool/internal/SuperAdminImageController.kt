package org.unividuell.countdown.core.imagepool.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/** The global pool has no slug and no members: the gate admits super-admins and nobody else. */
@RestController
@RequestMapping("/api/super-admin/images")
class SuperAdminImageController(
    private val gate: ImagePoolGate,
    private val service: ImagePoolService,
    private val users: UserQuery,
) {
    @GetMapping
    fun list(@AuthenticationPrincipal me: AuthenticatedUser): ImageListResponse {
        val pool = gate.global(me.isSuperAdmin)
        val summaries = service.list(pool = pool, viewerId = me.id)
        val names = namesFor(summaries)
        return ImageListResponse(
            images = summaries.map { response(summary = it, names = names) },
            used = service.count(pool),
            limit = service.limitOf(pool),
            viewerIsAdmin = pool.viewerIsAdmin,
        )
    }

    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @RequestPart("file") file: MultipartFile,
    ): ImageResponse {
        val pool = gate.global(me.isSuperAdmin)
        val saved = service.upload(pool = pool, uploaderId = me.id, bytes = file.bytes)
        return response(summary = saved, names = namesFor(listOf(saved)))
    }

    @GetMapping("/{id}/thumb")
    fun thumb(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<ByteArray> {
        val pool = gate.global(me.isSuperAdmin)
        return bytes(
            body = service.thumb(pool = pool, id = id, viewerId = me.id),
            mediaType = MediaType.IMAGE_JPEG_VALUE,
        )
    }

    @GetMapping("/{id}")
    fun original(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<ByteArray> {
        val pool = gate.global(me.isSuperAdmin)
        val original = service.original(pool = pool, id = id, viewerId = me.id)
        return bytes(body = original.bytes, mediaType = original.mediaType)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<Void> {
        val pool = gate.global(me.isSuperAdmin)
        service.delete(pool = pool, id = id, viewerId = me.id)
        return ResponseEntity.noContent().build()
    }

    private fun namesFor(summaries: List<ImageSummary>): Map<UUID, String> =
        users.findAllById(summaries.map { it.uploadedBy }.distinct()).associate { it.id!! to it.username }

    private fun response(summary: ImageSummary, names: Map<UUID, String>) = ImageResponse(
        id = summary.id,
        width = summary.width,
        height = summary.height,
        byteSize = summary.byteSize,
        createdAt = summary.createdAt,
        // An image whose uploader's row is gone stays listed rather than disappearing.
        uploadedBy = names[summary.uploadedBy] ?: "?",
    )

    /**
     * No Content-Disposition on purpose: the listing opens the original in a new tab, and
     * `attachment` would make the browser save the file instead of showing it.
     */
    private fun bytes(body: ByteArray, mediaType: String): ResponseEntity<ByteArray> =
        ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, mediaType)
            .header(HttpHeaders.CACHE_CONTROL, IMAGE_CACHE_CONTROL)
            .body(body)
}
