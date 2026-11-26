package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.EditionGameData
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.UserQuery
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.util.UUID

/** One row of an archived run's final table. No user id: the archive outlives the accounts. */
private data class FinalStanding(
    val rank: Int,
    val name: String,
    val shortName: String,
    val bgColorHex: String,
    val points: Int,
)

/**
 * Ends a community's active run: keeps the final table on the edition, deletes the run's game data.
 *
 *   lock edition ─► final points ─► table (active members) ─► purge game data ─► archivedAt
 *
 * One transaction. The `FOR UPDATE` lock makes a running announcement finish first, so its round is
 * purged too, and makes a later one see the edition as archived.
 */
@Service
class EditionArchiver(
    private val editions: CommunityEditionRepository,
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
    private val gameData: EditionGameData,
    private val mapper: ObjectMapper,
    private val clock: Clock,
) {
    @Transactional
    fun archive(communityId: UUID): CommunityEdition {
        val edition = editions.lockActiveByCommunityId(communityId) ?: throw EditionNotFoundException()
        val editionId = requireNotNull(edition.id)

        val table = finalTable(communityId = communityId, edition = edition)
        gameData.purge(editionId)

        return editions.save(
            edition.copy(archivedAt = clock.instant(), finalStandings = mapper.valueToTree(table)),
        )
    }

    /** The roster's order (points, then join date), ranked 1, 1, 3 as the closing poster ranks. */
    private fun finalTable(communityId: UUID, edition: CommunityEdition): List<FinalStanding> {
        val active = members.findByCommunityId(communityId).filter { it.status == MemberStatus.ACTIVE }
        if (active.isEmpty()) return emptyList()

        val ids = active.map { it.userId }
        val byId = users.findAllById(ids).associateBy { it.id }
        val points = gameData.finalPoints(edition = edition, userIds = ids)

        val sorted = active
            .sortedWith(
                compareByDescending<CommunityMember> { points[it.userId] ?: 0 }
                    .thenBy { it.createdAt ?: Instant.EPOCH }
                    .thenBy { it.userId },
            )
            .mapNotNull { member ->
                val user = byId[member.userId] ?: return@mapNotNull null
                val identity = MemberIdentityResolver.resolve(
                    user = user,
                    displayName = member.displayName,
                    bgColorHex = member.bgColorHex,
                )
                identity to (points[member.userId] ?: 0)
            }

        return sorted.map { (identity, p) ->
            FinalStanding(
                rank = 1 + sorted.indexOfFirst { it.second == p },
                name = identity.username,
                shortName = identity.avatar.shortName,
                bgColorHex = identity.avatar.bgColorHex,
                points = p,
            )
        }
    }
}
