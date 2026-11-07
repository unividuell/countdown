package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.MemberIdentity
import java.time.Instant
import java.util.UUID

data class EditionResponse(
    val label: String?,
    val targetAt: Instant,
    val targetTimezone: String,
    val phaseTwoStartRound: Int?,
    val gamesFromRound: Int,
    val gamesUntilRound: Int,
    val frozen: Boolean,
)
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    /** `null` until an admin has set the run up. */
    val edition: EditionResponse?,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
    /** How the viewer appears here; null when they have no membership row in this community. */
    val viewerIdentity: MemberIdentity?,
)
data class CommunitySummary(val id: UUID, val name: String, val slug: String)
data class CreateCommunityRequest(val name: String)
data class UpdateCommunityRequest(val name: String)
data class EditionRequest(
    val label: String?,
    val targetAt: Instant,
    val targetTimezone: String,
    val phaseTwoStartRound: Int?,
    val gamesFromRound: Int,
) {
    fun toDraft() = EditionDraft(
        label = label,
        targetAt = targetAt,
        targetTimezone = targetTimezone,
        phaseTwoStartRound = phaseTwoStartRound,
        gamesFromRound = gamesFromRound,
    )
}
data class InviteResponse(val url: String, val expiresAt: Instant)
/** What an anonymous visitor may learn from an invite link: who is inviting. Nothing else. */
data class InvitePeekResponse(val name: String)
data class SelectionRequest(val communityId: UUID)
data class MemberResponse(
    val userId: UUID, val username: String, val status: String, val isAdmin: Boolean,
)
data class AcceptResponse(val status: String, val name: String, val slug: String)

data class LivePointsResponse(val points: Int, val provisional: Boolean)

@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
data class RosterPointsResponse(val stable: Int, val live: LivePointsResponse?)

data class RosterMemberResponse(
    val userId: UUID,
    val shortName: String,
    val fullName: String,
    val bgColorHex: String,
    val points: RosterPointsResponse,
)

fun CommunityEdition.toResponse(frozen: Boolean) = EditionResponse(
    label = label,
    targetAt = targetAt,
    targetTimezone = targetTimezone,
    phaseTwoStartRound = phaseTwoStartRound,
    gamesFromRound = gamesFromRound,
    gamesUntilRound = gamesUntilRound,
    frozen = frozen,
)
fun Community.toResponse(
    edition: EditionResponse?,
    viewerIsAdmin: Boolean,
    pendingCount: Int,
    viewerIdentity: MemberIdentity?,
) = CommunityResponse(
    id = requireNotNull(id), name = name, slug = slug,
    edition = edition,
    viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount, viewerIdentity = viewerIdentity,
)
fun Community.toSummary() = CommunitySummary(id = requireNotNull(id), name = name, slug = slug)

data class MemberProfileResponse(
    /** The raw override; null on either field means the global profile applies to it. */
    val displayName: String?,
    val bgColorHex: String?,
    /** What that resolves to — what the roster draws for this member today. */
    val identity: MemberIdentity,
)
data class UpdateMemberProfileRequest(val displayName: String?, val bgColorHex: String?)

data class SuperAdminMemberResponse(
    val userId: UUID, val username: String, val githubLogin: String,
    val status: String, val isAdmin: Boolean, val joinedAt: Instant?,
)
data class SuperAdminCommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val targetAt: Instant?, val targetTimezone: String, val createdAt: Instant?,
    val members: List<SuperAdminMemberResponse>,
)
