package org.unividuell.countdown.core.community

import java.util.UUID

/**
 * What archiving needs from the games played in a run: the final points, then the data gone.
 *
 * The interface lives in the consumer module, as [MemberPointsQuery] does: `community` must not
 * depend on `game`, and `game` implements it.
 */
interface EditionGameData {

    /** Every player's points in [edition], viewer-independent, running round included. Players without points are absent. */
    fun finalPoints(edition: CommunityEdition, userIds: Collection<UUID>): Map<UUID, Int>

    /** Deletes every round of the run, and with them all plays, votes and assets. */
    fun purge(editionId: UUID)
}
