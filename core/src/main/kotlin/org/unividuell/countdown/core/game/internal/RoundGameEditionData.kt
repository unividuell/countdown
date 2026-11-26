package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.EditionGameData
import java.util.UUID

/**
 * The game side of archiving a run.
 *
 * [finalPoints] counts what [RoundPlayPoints] counts — rounds inside the window — but for everyone
 * and without the live gate: the run is over, nothing is left to hide.
 */
@Component
class RoundGameEditionData(
    private val plays: RoundPlayRepository,
    private val rounds: RoundGameRepository,
) : EditionGameData {

    @Transactional(readOnly = true)
    override fun finalPoints(edition: CommunityEdition, userIds: Collection<UUID>): Map<UUID, Int> {
        // `IN ()` is a syntax error, and there is nothing to sum for nobody.
        if (userIds.isEmpty()) return emptyMap()

        return plays.pointsOf(editionId = requireNotNull(edition.id), userIds = userIds)
            .filter { windowReasonOf(edition = edition, roundNumber = it.roundNumber) == null }
            .groupBy { it.userId }
            .mapValues { (_, rounds) -> rounds.sumOf { it.points } }
    }

    @Transactional
    override fun purge(editionId: UUID) {
        rounds.deleteByEditionId(editionId)
    }
}
