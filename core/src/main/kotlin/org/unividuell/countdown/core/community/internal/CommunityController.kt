package org.unividuell.countdown.core.community.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User

@RestController
@RequestMapping("/api/communities")
class CommunityController(
    private val communityService: CommunityService,
    private val membershipQuery: MembershipQuery,
    private val access: CommunityAccess,
    private val selection: SelectionService,
) {
    private val CountdownOAuth2User.uid get() = user.id!!
    private val CountdownOAuth2User.sa get() = user.isSuperAdmin

    @PostMapping
    fun create(@AuthenticationPrincipal me: CountdownOAuth2User, @RequestBody body: CreateCommunityRequest): ResponseEntity<CommunityResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(communityService.create(me.uid, body.name).toResponse())

    @GetMapping
    fun mine(@AuthenticationPrincipal me: CountdownOAuth2User): List<CommunitySummary> =
        membershipQuery.activeCommunitiesOf(me.uid).map { it.toSummary() }

    @GetMapping("/selection")
    fun getSelection(@AuthenticationPrincipal me: CountdownOAuth2User): Map<String, Any?> =
        mapOf("communityId" to selection.get(me.uid))

    @PutMapping("/selection")
    fun setSelection(@AuthenticationPrincipal me: CountdownOAuth2User, @RequestBody body: SelectionRequest): ResponseEntity<Void> {
        selection.set(me.uid, body.communityId); return ResponseEntity.noContent().build()
    }

    @GetMapping("/{slug}")
    fun get(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String): CommunityResponse =
        access.requireActiveMember(me.uid, me.sa, slug).toResponse()

    @PatchMapping("/{slug}")
    fun update(@AuthenticationPrincipal me: CountdownOAuth2User, @PathVariable slug: String, @RequestBody body: UpdateCommunityRequest): CommunityResponse {
        val c = access.requireAdmin(me.uid, me.sa, slug)
        return communityService.update(c, body.name, body.startsAt, body.phaseTwoStartRound).toResponse()
    }
}
