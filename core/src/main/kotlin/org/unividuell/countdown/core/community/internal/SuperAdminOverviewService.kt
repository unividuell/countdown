package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery

/**
 * System-wide read model for the super-admin area: every community with its full roster.
 *
 * Four queries regardless of how many communities exist: users are fetched in one batch rather
 * than one lookup per roster row.
 */
@Service
class SuperAdminOverviewService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val editions: CommunityEditionRepository,
    private val users: UserQuery,
) {
    @Transactional(readOnly = true)
    fun overview(): List<SuperAdminCommunityResponse> {
        val allMembers = members.findAll().toList()
        val byCommunity = allMembers.groupBy { it.communityId }
        val usersById = users.findAllById(allMembers.map { it.userId }.distinct()).associateBy { it.id }
        // One query for every community's active edition. A requireActive() inside the map below
        // would be an N+1 that grows with the number of communities — see persistence.md.
        val activeEditions = editions.findAllActive().associateBy { it.communityId }

        return communities.findAll()
            .sortedBy { it.name.lowercase() }
            .map { c ->
                // Local non-null id: byCommunity is keyed on UUID, and Community.id is UUID?.
                val id = requireNotNull(c.id)
                val edition = activeEditions[id]
                SuperAdminCommunityResponse(
                    id = id,
                    name = c.name,
                    slug = c.slug,
                    startsAt = edition?.startsAt,
                    startsAtTimezone = edition?.startsAtTimezone ?: CommunityEdition.DEFAULT_TIMEZONE,
                    createdAt = c.createdAt,
                    members = byCommunity[id].orEmpty()
                        .map { it.toResponse(usersById[it.userId]) }
                        .sortedWith(MEMBER_ORDER),
                )
            }
    }

    private fun CommunityMember.toResponse(user: User?) = SuperAdminMemberResponse(
        userId = userId,
        username = user?.username ?: UNKNOWN,
        githubLogin = user?.githubLogin ?: UNKNOWN,
        status = status.name,
        isAdmin = isAdmin,
        joinedAt = createdAt,
    )

    private companion object {
        /** A membership whose user row is gone stays visible rather than vanishing. */
        const val UNKNOWN = "?"
        val MEMBER_ORDER = compareBy<SuperAdminMemberResponse>(
            { if (it.isAdmin) 0 else 1 },
            { if (it.status == MemberStatus.ACTIVE.name) 0 else 1 },
            { it.username.lowercase() },
        )
    }
}
