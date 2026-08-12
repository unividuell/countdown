package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery

@RestController
@RequestMapping("/api/communities")
class CommunityController(
    private val communityService: CommunityService,
    private val editions: EditionService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
    private val memberRepo: CommunityMemberRepository,
    private val users: UserQuery,
) {
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> {
        if (!users.mayCreateCommunities(me.id)) throw CommunityCreationNotAllowedException()
        val community = communityService.create(creatorUserId = me.id, rawName = body.name)
        val edition = editions.requireActive(requireNotNull(community.id))
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(community.toResponse(edition = edition, viewerIsAdmin = true, pendingCount = 0))
    }

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
        val c = access.requireActiveMember(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val isAdmin = me.isSuperAdmin || membershipQuery.isAdmin(communityId = id, userId = me.id)
        val pending = if (isAdmin) memberRepo.countByCommunityIdAndStatus(communityId = id, status = MemberStatus.PENDING).toInt() else 0
        return c.toResponse(edition = editions.requireActive(id), viewerIsAdmin = isAdmin, pendingCount = pending)
    }

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val updated = communityService.update(
            community = c,
            name = body.name,
            label = body.editionLabel,
            startsAt = body.startsAt,
            startsAtTimezone = body.startsAtTimezone,
            phaseTwoStartRound = body.phaseTwoStartRound,
            gamesFromRound = body.gamesFromRound,
            gamesUntilRound = body.gamesUntilRound,
        )
        val pending = memberRepo.countByCommunityIdAndStatus(communityId = id, status = MemberStatus.PENDING).toInt()
        return updated.community.toResponse(edition = updated.edition, viewerIsAdmin = true, pendingCount = pending)
    }

    /**
     * Start the next run: the current one is archived, the new one inherits its setup and starts
     * without a date. The membership stays where it belongs — on the community.
     */
    @PostMapping("/{slug}/editions")
    fun startEdition(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: StartEditionRequest,
    ): ResponseEntity<CommunityResponse> {
        val c = access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val edition = editions.startNew(communityId = id, rawLabel = body.label)
        val pending = memberRepo.countByCommunityIdAndStatus(communityId = id, status = MemberStatus.PENDING).toInt()
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(c.toResponse(edition = edition, viewerIsAdmin = true, pendingCount = pending))
    }
}
