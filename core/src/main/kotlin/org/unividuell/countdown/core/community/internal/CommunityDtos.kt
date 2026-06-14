package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.Community
import java.time.Instant
import java.util.UUID

data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
data class CommunitySummary(val id: UUID, val name: String, val slug: String)
data class CreateCommunityRequest(val name: String)
data class UpdateCommunityRequest(val name: String?, val startsAt: Instant?, val startsAtTimezone: String?, val phaseTwoStartRound: Int?)
data class InviteResponse(val url: String, val expiresAt: Instant)
data class SelectionRequest(val communityId: UUID)
data class MemberResponse(
    val userId: UUID, val username: String, val status: String, val isAdmin: Boolean,
)
data class AcceptResponse(val status: String, val name: String, val slug: String)

fun Community.toResponse(viewerIsAdmin: Boolean, pendingCount: Int) =
    CommunityResponse(id!!, name, slug, startsAt, startsAtTimezone, phaseTwoStartRound, viewerIsAdmin, pendingCount)
fun Community.toSummary() = CommunitySummary(id!!, name, slug)
