package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Instant
import java.util.UUID

@Service
class RosterService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
    private val points: MemberPointsQuery,
) {
    fun of(communityId: UUID, viewerId: UUID): List<RosterMemberResponse> {
        val active = members.findByCommunityId(communityId).filter { it.status == MemberStatus.ACTIVE }
        if (active.isEmpty()) return emptyList()

        val ids = active.map { it.userId }
        val byId = users.findAllById(ids).associateBy { it.id }
        val standings = points.standings(communityId, viewerId, ids)

        return active
            .sortedWith(
                compareByDescending<CommunityMember> { rank(standings[it.userId]) }
                    .thenBy { it.createdAt ?: Instant.EPOCH }
                    .thenBy { it.userId },
            )
            .mapNotNull { member ->
                val user = byId[member.userId] ?: return@mapNotNull null
                val p = standings[member.userId] ?: MemberPoints(stable = 0, live = null)
                val identity = MemberIdentityResolver.resolve(
                    user = user,
                    displayName = member.displayName,
                    bgColorHex = member.bgColorHex,
                )
                RosterMemberResponse(
                    userId = member.userId,
                    shortName = identity.avatar.shortName,
                    fullName = identity.username,
                    bgColorHex = identity.avatar.bgColorHex,
                    points = RosterPointsResponse(
                        stable = p.stable,
                        live = p.live?.let {
                            LivePointsResponse(points = it.points, provisional = it.provisional)
                        },
                    ),
                )
            }
    }

    /** Ranked by exactly what is displayed: a rank driven by points the viewer cannot see would be
     *  inexplicable to them. */
    private fun rank(p: MemberPoints?): Int = (p?.stable ?: 0) + (p?.live?.points ?: 0)
}
