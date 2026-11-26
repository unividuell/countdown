package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameWeight
import java.util.UUID

/** A community's game weights. A game without an entry is normal. */
@Component
class GameWeightStore(
    private val rows: CommunityGameWeightRepository,
    private val catalog: GameCatalog,
) {
    /** Only games this build has: a row for a removed game must not reach the selection or the API. */
    @Transactional(readOnly = true)
    fun weightsOf(communityId: UUID): Map<String, GameWeight> {
        val known = catalog.ids().toSet()

        return rows.findByCommunityId(communityId)
            .filter { it.gameType in known }
            .associate { it.gameType to it.weight }
    }

    /** The whole set at once: a game left out, or set to normal, loses its row. */
    @Transactional
    fun replace(communityId: UUID, weights: Map<String, GameWeight>) {
        rows.deleteByCommunityId(communityId)
        rows.saveAll(
            weights.filterValues { it != GameWeight.NORMAL }.map { (gameType, weight) ->
                CommunityGameWeight(communityId = communityId, gameType = gameType, weight = weight)
            },
        )
    }
}
