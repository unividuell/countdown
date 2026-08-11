package org.unividuell.countdown.core.countdown.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
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
@Transactional(readOnly = true)
class CountdownService(
    private val communityQuery: CommunityQuery,
    private val membershipQuery: MembershipQuery,
    private val engine: CountdownEngine,
    private val clock: Clock,
) : CountdownQuery {

    override fun currentRound(communityId: UUID, now: Instant): Round? {
        val edition = communityQuery.activeEditionOf(communityId) ?: return null
        val startsAt = edition.startsAt ?: return null
        return engine.roundAt(now, startsAt, ZoneId.of(edition.startsAtTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        val communityId = requireNotNull(c.id)
        if (!isSuperAdmin && !membershipQuery.isActiveMember(communityId, userId)) {
            throw CountdownAccessDeniedException()
        }
        val now = clock.instant()
        // No active edition is an invariant violation elsewhere, but here it reads the same as
        // "no date yet": there is nothing to count down to, so the display says so.
        val edition = communityQuery.activeEditionOf(communityId)
            ?: return CountdownResponse(now, null, CommunityEdition.DEFAULT_TIMEZONE, null, null)
        val startsAt = edition.startsAt
            ?: return CountdownResponse(now, null, edition.startsAtTimezone, null, null)
        val zone = ZoneId.of(edition.startsAtTimezone)
        val current = engine.roundAt(now, startsAt, zone)
        val next = engine.intervalOf(current.number - 1, startsAt, zone) // later in time = number - 1
        return CountdownResponse(now, startsAt, edition.startsAtTimezone, current.toDto(), next.toDto())
    }
}
