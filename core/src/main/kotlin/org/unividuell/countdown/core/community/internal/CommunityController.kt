package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.iam.isSuperAdmin
import java.util.UUID

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
    private val identities: MemberIdentityQuery,
) {
    @PostMapping
    fun create(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> {
        if (!users.mayCreateCommunities(me.id)) throw CommunityCreationNotAllowedException()
        val community = communityService.create(creatorUserId = me.id, rawName = body.name)
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(
                community.toResponse(
                    edition = null,
                    viewerIsAdmin = true, pendingCount = 0,
                    viewerIdentity = identities.of(communityId = requireNotNull(community.id), userId = me.id),
                ),
            )
    }

    @GetMapping
    fun mine(@AuthenticationPrincipal me: AuthenticatedUser): List<CommunitySummary> =
        membershipQuery.activeCommunitiesOf(me.id).map { it.toSummary() }

    @GetMapping("/selection")
    fun getSelection(@AuthenticationPrincipal me: AuthenticatedUser): Map<String, Any?> =
        mapOf("communityId" to selection.get(me.id))

    @PutMapping("/selection")
    fun setSelection(@AuthenticationPrincipal me: AuthenticatedUser, @RequestBody body: SelectionRequest): ResponseEntity<Void> {
        selection.set(userId = me.id, communityId = body.communityId); return ResponseEntity.noContent().build()
    }

    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CommunityResponse {
        val c = access.requireActiveMember(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val isAdmin = me.isSuperAdmin || membershipQuery.isAdmin(communityId = id, userId = me.id)
        val pending = if (isAdmin) pendingCount(id) else 0
        return respond(community = c, viewerIsAdmin = isAdmin, pendingCount = pending, userId = me.id)
    }

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val renamed = communityService.rename(community = c, name = body.name)
        return respond(community = renamed, viewerIsAdmin = true, pendingCount = pendingCount(requireNotNull(c.id)), userId = me.id)
    }

    /** Opens the community's run; 409 while one is active. The membership stays on the community. */
    @PostMapping("/{slug}/editions")
    fun createEdition(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: EditionRequest,
    ): ResponseEntity<CommunityResponse> {
        val c = access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val edition = editions.create(communityId = id, draft = body.toDraft())
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(respond(community = c, edition = edition, viewerIsAdmin = true, pendingCount = pendingCount(id), userId = me.id))
    }

    /** Overwrites the active run's editable fields; 404 without one, 409 where the freeze forbids it. */
    @PutMapping("/{slug}/editions/active")
    fun replaceEdition(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: EditionRequest,
    ): CommunityResponse {
        val c = access.requireAdmin(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
        val id = requireNotNull(c.id)
        val edition = editions.replace(communityId = id, draft = body.toDraft())
        return respond(community = c, edition = edition, viewerIsAdmin = true, pendingCount = pendingCount(id), userId = me.id)
    }

    private fun pendingCount(communityId: UUID): Int =
        memberRepo.countByCommunityIdAndStatus(communityId = communityId, status = MemberStatus.PENDING).toInt()

    private fun respond(
        community: Community,
        edition: CommunityEdition? = editions.active(requireNotNull(community.id)),
        viewerIsAdmin: Boolean,
        pendingCount: Int,
        userId: UUID,
    ) = community.toResponse(
        edition = edition?.toResponse(frozen = editions.isFrozen(edition)),
        viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount,
        viewerIdentity = identities.of(communityId = requireNotNull(community.id), userId = userId),
    )
}
