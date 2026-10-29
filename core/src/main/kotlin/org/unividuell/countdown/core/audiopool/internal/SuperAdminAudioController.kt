package org.unividuell.countdown.core.audiopool.internal

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
import org.unividuell.countdown.core.iam.isSuperAdmin
import java.util.UUID

/** The global pool has no slug and no members: the gate admits super-admins and nobody else. */
@RestController
@RequestMapping("/api/super-admin/audio")
class SuperAdminAudioController(
    private val gate: AudioPoolGate,
    private val service: AudioPoolService,
    private val users: UserQuery,
) {
    @GetMapping
    fun list(@AuthenticationPrincipal me: AuthenticatedUser): AudioListResponse {
        val pool = gate.global(me.isSuperAdmin)
        return listResponse(users = users, service = service, pool = pool, viewerId = me.id)
    }

    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @RequestPart("file") file: MultipartFile,
    ): AudioClipResponse {
        val pool = gate.global(me.isSuperAdmin)
        val saved = service.upload(
            pool = pool,
            uploaderId = me.id,
            fileName = file.originalFilename,
            bytes = file.bytes,
        )
        return saved.toResponse(namesFor(users = users, summaries = listOf(saved)))
    }

    @GetMapping("/{id}")
    fun wav(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<ByteArray> {
        val pool = gate.global(me.isSuperAdmin)
        return wavResponse(service.wav(pool = pool, id = id, viewerId = me.id))
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<Void> {
        val pool = gate.global(me.isSuperAdmin)
        service.delete(pool = pool, id = id, viewerId = me.id)
        return ResponseEntity.noContent().build()
    }
}
