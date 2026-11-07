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
        return engine.roundAt(now = now, targetAt = edition.targetAt, zone = ZoneId.of(edition.targetTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        val communityId = requireNotNull(c.id)
        if (!isSuperAdmin && !membershipQuery.isActiveMember(communityId = communityId, userId = userId)) {
            throw CountdownAccessDeniedException()
        }
        val now = clock.instant()
        // No active edition: there is nothing to count down to, so the display says so.
        val edition = communityQuery.activeEditionOf(communityId) ?: return CountdownResponse(
            serverNow = now, targetAt = null,
            targetTimezone = CommunityEdition.DEFAULT_TIMEZONE, round = null, nextRound = null,
        )
        val zone = ZoneId.of(edition.targetTimezone)
        val current = engine.roundAt(now = now, targetAt = edition.targetAt, zone = zone)
        // later in time = number + 1
        val next = engine.intervalOf(number = current.number + 1, targetAt = edition.targetAt, zone = zone)
        return CountdownResponse(
            serverNow = now, targetAt = edition.targetAt, targetTimezone = edition.targetTimezone,
            round = current.toDto(), nextRound = next.toDto(),
        )
    }
}
