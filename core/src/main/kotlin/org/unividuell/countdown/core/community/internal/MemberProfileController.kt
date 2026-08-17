package org.unividuell.countdown.core.community.internal

import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

/** The caller's own appearance inside one community. Never anybody else's. */
@RestController
@RequestMapping("/api/communities/{slug}/me")
class MemberProfileController(
    private val access: CommunityAccess,
    private val profiles: MemberProfileService,
) {

    @GetMapping("/profile")
    fun get(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): MemberProfileResponse {
        val c = admit(me = me, slug = slug)
        return profiles.get(communityId = requireNotNull(c.id), userId = me.id)
    }

    @PutMapping("/profile")
    fun put(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: UpdateMemberProfileRequest,
    ): MemberProfileResponse {
        val c = admit(me = me, slug = slug)
        return profiles.put(
            communityId = requireNotNull(c.id),
            userId = me.id,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        )
    }

    @DeleteMapping("/profile")
    fun delete(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): ResponseEntity<Void> {
        val c = admit(me = me, slug = slug)
        profiles.clear(communityId = requireNotNull(c.id), userId = me.id)
        return ResponseEntity.noContent().build()
    }

    private fun admit(me: AuthenticatedUser, slug: String) =
        access.requireActiveMember(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
}
