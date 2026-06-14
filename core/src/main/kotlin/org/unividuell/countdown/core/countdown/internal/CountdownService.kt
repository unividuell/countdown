package org.unividuell.countdown.core.countdown.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.CountdownQuery
import org.unividuell.countdown.core.countdown.Round
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Service
class CountdownService(
    private val communityQuery: CommunityQuery,
    private val membershipQuery: MembershipQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : CountdownQuery {

    override fun currentRound(communityId: UUID, now: Instant): Round? {
        val c = communityQuery.findById(communityId) ?: return null
        val startsAt = c.startsAt ?: return null
        return engine.roundAt(now, startsAt, ZoneId.of(c.startsAtTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        if (!isSuperAdmin && !membershipQuery.isActiveMember(c.id!!, userId)) throw CountdownAccessDeniedException()
        val now = clock.instant()
        val startsAt = c.startsAt
            ?: return CountdownResponse(now, null, c.startsAtTimezone, null, null)
        val zone = ZoneId.of(c.startsAtTimezone)
        val current = engine.roundAt(now, startsAt, zone)
        val next = engine.intervalOf(current.number - 1, startsAt, zone) // later in time = number - 1
        return CountdownResponse(now, startsAt, c.startsAtTimezone, current.toDto(), next.toDto())
    }
}
