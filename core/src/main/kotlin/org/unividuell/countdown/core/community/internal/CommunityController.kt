package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.iam.AuthenticatedUser

@RestController
@RequestMapping("/api/communities")
class CommunityController(
    private val communityService: CommunityService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
    private val memberRepo: CommunityMemberRepository,
) {
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(communityService.create(me.id, body.name).toResponse(viewerIsAdmin = true, pendingCount = 0))

    @GetMapping
    fun mine(@AuthenticationPrincipal me: AuthenticatedUser): List<CommunitySummary> =
        membershipQuery.activeCommunitiesOf(me.id).map { it.toSummary() }

    @GetMapping("/selection")
    fun getSelection(@AuthenticationPrincipal me: AuthenticatedUser): Map<String, Any?> =
        mapOf("communityId" to selection.get(me.id))

    @PutMapping("/selection")
    fun setSelection(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: SelectionRequest): ResponseEntity<Void> {
        selection.set(me.id, body.communityId); return ResponseEntity.noContent().build()
    }

    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CommunityResponse {
        val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug)
        val isAdmin = me.isSuperAdmin || membershipQuery.isAdmin(c.id!!, me.id)
        val pending = if (isAdmin) memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING).toInt() else 0
        return c.toResponse(viewerIsAdmin = isAdmin, pendingCount = pending)
    }

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(me.id, me.isSuperAdmin, slug)
        val updated = communityService.update(c, body.name, body.startsAt, body.phaseTwoStartRound)
        val pending = memberRepo.countByCommunityIdAndStatus(c.id!!, MemberStatus.PENDING).toInt()
        return updated.toResponse(viewerIsAdmin = true, pendingCount = pending)
    }
}
