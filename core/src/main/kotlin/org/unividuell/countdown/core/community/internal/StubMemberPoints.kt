package org.unividuell.countdown.core.community.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.rng.SeededRandom
import java.util.UUID

/**
 * Invented but stable standings, so the ranking and its animation can be judged on localhost and
 * staging — both of which run the seeded Futurama test users anyway, so these numbers make no claim
 * about real players. `@Profile("!production")` is a second belt: even a misconfigured property
 * cannot switch this on in prod.
 *
 * [viewerId] is unused here because there are no rounds to gate on yet; the real implementation will
 * use it to decide whether live points may be returned at all.
 */
@Component
@Profile("!production")
@ConditionalOnProperty(name = ["app.stub-points.enabled"], havingValue = "true")
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
