package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameWeight
import java.util.UUID

/** One game as a community's settings show it. */
data class GameEntry(val id: String, val displayName: String, val weight: GameWeight)

/**
 * Reads and sets a community's game weights. Admin is a super-admin or this community's admin — the
 * settings page lets both in, so a refusal here would only surface as a failed save.
 */
@Service
class GameWeightService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val catalog: GameCatalog,
    private val store: GameWeightStore,
) {
    /** Every game this build has, sorted by name as the settings list shows them. */
    fun games(slug: String, userId: UUID, isSuperAdmin: Boolean): List<GameEntry> {
        val communityId = communityOf(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        val weights = store.weightsOf(communityId)

        return catalog.ids()
            .map { id ->
                GameEntry(
                    id = id,
                    displayName = requireNotNull(catalog.handle(id)).displayName,
                    weight = weights[id] ?: GameWeight.NORMAL,
                )
            }
            .sortedBy { it.displayName }
    }

    /** Replaces the whole set; a game left out is normal. */
    fun setWeights(slug: String, userId: UUID, isSuperAdmin: Boolean, weights: Map<String, GameWeight>) {
        val communityId = communityOf(slug = slug, userId = userId, isSuperAdmin = isSuperAdmin)
        if (!isSuperAdmin && !memberships.isAdmin(communityId = communityId, userId = userId)) {
            throw GameWeightsForbiddenException()
        }

        val ids = catalog.ids()
        val unknown = weights.keys - ids.toSet()
        if (unknown.isNotEmpty()) throw InvalidGameWeightsException("unknown games: $unknown")
        if (ids.all { weights[it] == GameWeight.OFF }) throw InvalidGameWeightsException("at least one game must stay on")

        store.replace(communityId = communityId, weights = weights)
    }

    /** A non-member gets the same 404 as an unknown slug, so membership does not leak. */
    private fun communityOf(slug: String, userId: UUID, isSuperAdmin: Boolean): UUID {
        val communityId = communities.findBySlug(slug)?.id ?: throw RoundAccessDeniedException()
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw RoundAccessDeniedException()
        }

        return communityId
    }
}
