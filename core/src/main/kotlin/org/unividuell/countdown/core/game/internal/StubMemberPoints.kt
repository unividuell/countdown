package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.rng.SeededRandom
import java.util.UUID

/**
 * Invented but stable standings, so the ranking and its animation can be judged on localhost and
 * staging — both of which run the seeded Futurama test users anyway, so these numbers make no claim
 * about real players.
 *
 * [viewerId] is unused here: these numbers are not tied to rounds at all, which is exactly what makes
 * them useless for judging the live-points gate — that one belongs to [RoundPlayPoints].
 */
class StubMemberPoints : MemberPointsQuery {
    override fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> =
        userIds.associateWith { userId ->
            val rnd = SeededRandom.fromSeed("$communityId:$userId")
            MemberPoints(
                stable = rnd.nextIntBetween(0, 40),
                live = if (rnd.nextBoolean()) rnd.nextIntBetween(1, 6) else null,
            )
        }
}
