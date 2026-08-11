package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Instant
import java.util.UUID

data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val editionLabel: String, val gamesFromRound: Int?, val gamesUntilRound: Int,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
)
data class CommunitySummary(val id: UUID, val name: String, val slug: String)
data class CreateCommunityRequest(val name: String)
data class UpdateCommunityRequest(
    val name: String?, val editionLabel: String?,
    val startsAt: Instant?, val startsAtTimezone: String?, val phaseTwoStartRound: Int?,
    val gamesFromRound: Int?, val gamesUntilRound: Int?,
)
data class StartEditionRequest(val label: String)
data class InviteResponse(val url: String, val expiresAt: Instant)
data class SelectionRequest(val communityId: UUID)
data class MemberResponse(
    val userId: UUID, val username: String, val status: String, val isAdmin: Boolean,
)
data class AcceptResponse(val status: String, val name: String, val slug: String)

@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
data class RosterPointsResponse(val stable: Int, val live: Int?)

data class RosterMemberResponse(
    val userId: UUID,
    val shortName: String,
    val fullName: String,
    val bgColorHex: String,
    val points: RosterPointsResponse,
)

fun Community.toResponse(edition: CommunityEdition, viewerIsAdmin: Boolean, pendingCount: Int) =
    CommunityResponse(
        id = requireNotNull(id), name = name, slug = slug,
        startsAt = edition.startsAt,
        startsAtTimezone = edition.startsAtTimezone,
        phaseTwoStartRound = edition.phaseTwoStartRound,
        editionLabel = edition.label,
        gamesFromRound = edition.gamesFromRound,
        gamesUntilRound = edition.gamesUntilRound,
        viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount,
    )
fun Community.toSummary() = CommunitySummary(id!!, name, slug)

data class SuperAdminMemberResponse(
    val userId: UUID, val username: String, val githubLogin: String,
    val status: String, val isAdmin: Boolean, val joinedAt: Instant?,
)
data class SuperAdminCommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val createdAt: Instant?,
    val members: List<SuperAdminMemberResponse>,
)
