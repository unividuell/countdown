package org.unividuell.countdown.core.iam.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Full desired state of the clearance, so a repeated call is idempotent. */
data class CommunityCreationRequest(val allowed: Boolean)

/**
 * User administration for the super-admin area.
 *
 * No authorization check and no principal parameter on purpose: the whole `/api/super-admin` tree
 * is gated centrally by `hasRole("SUPER_ADMIN")` in SecurityConfig, so anything that reaches this
 * controller is already a super-admin.
 *
 * Note: do not write the glob form of that path inside this KDoc — Kotlin block comments nest,
 * so an embedded slash-star-star opens a nested comment and leaves the file unclosed.
 */
@RestController
@RequestMapping("/api/super-admin/users")
class SuperAdminUserController(private val service: SuperAdminUserService) {

    @GetMapping
    fun users(): List<SuperAdminUserListEntry> = service.list()

    @GetMapping("/{id}")
    fun user(@PathVariable id: UUID): SuperAdminUserDetail = service.detail(id)

    @PutMapping("/{id}/community-creation")
    fun setCommunityCreation(
        @PathVariable id: UUID,
        @RequestBody body: CommunityCreationRequest,
    ): SuperAdminUserDetail = service.setCommunityCreation(id, body.allowed)
}
