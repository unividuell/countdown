package org.unividuell.countdown.core.community.internal

import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.springframework.web.util.UriComponentsBuilder
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

@RestController
@RequestMapping("/api/communities")
class MemberController(
    private val membership: MembershipService,
    private val access: CommunityAccess,
    private val memberRepo: CommunityMemberRepository,
    private val userQuery: UserQuery,
) {
    @PostMapping("/{slug}/invite")
    fun invite(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): InviteResponse {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val info = membership.generateInvite(c.id!!)
        val url = UriComponentsBuilder.fromPath("/join/{token}").buildAndExpand(info.token).toUriString()
        return InviteResponse(url = url, expiresAt = info.expiresAt)
    }

    @DeleteMapping("/{slug}/invite")
    fun revoke(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): ResponseEntity<Void> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug); membership.revokeInvite(c.id!!)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/join/{token}")
    fun join(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable token: String): AcceptResponse {
        val r = membership.accept(token, me.id)
        val status = when (r) {
            is AcceptResult.JoinedPending -> "JOINED_PENDING"
            is AcceptResult.AlreadyPending -> "ALREADY_PENDING"
            is AcceptResult.AlreadyActive -> "ALREADY_ACTIVE"
        }
        return AcceptResponse(status, r.community.name, r.community.slug)
    }

    @GetMapping("/{slug}/members")
    fun members(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): List<MemberResponse> {
        val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug)
        return memberRepo.findByCommunityId(c.id!!).map {
            MemberResponse(
                userId = it.userId,
                username = userQuery.findById(it.userId)?.username ?: "?",
                status = it.status.name,
                isAdmin = it.isAdmin,
            )
        }
    }

    @PostMapping("/{slug}/members/{userId}/approve")
    fun approve(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug); membership.approve(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{slug}/members/{userId}/promote")
    fun promote(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug); membership.promote(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{slug}/members/{userId}/demote")
    fun demote(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug); membership.demote(c.id!!, userId)
        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("/{slug}/members/{userId}")
    fun remove(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @PathVariable userId: UUID): ResponseEntity<Void> {
        // self-leave: an active member may remove themselves; otherwise admin required
        if (userId == me.id) {
            val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug); membership.leave(c.id!!, me.id)
        } else {
            val c = access.requireAdmin(me.id, me.isSuperAdmin, slug); membership.remove(c.id!!, userId)
        }
        return ResponseEntity.noContent().build()
    }
}
