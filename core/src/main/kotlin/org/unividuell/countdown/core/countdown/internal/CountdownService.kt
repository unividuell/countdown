package org.unividuell.countdown.core.countdown.internal

import io.github.oshai.kotlinlogging.KotlinLogging
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

    private val logger = KotlinLogging.logger {}

    override fun currentRound(communityId: UUID, now: Instant): Round? {
        val edition = communityQuery.activeEditionOf(communityId) ?: return null
        val startsAt = edition.startsAt ?: return null
        return engine.roundAt(now = now, startsAt = startsAt, zone = ZoneId.of(edition.startsAtTimezone))
    }

    /** Build the display payload for [slug], gated to active members (super-admin allowed). */
    fun forSlug(slug: String, userId: UUID, isSuperAdmin: Boolean): CountdownResponse {
        val c = communityQuery.findBySlug(slug) ?: throw CountdownAccessDeniedException()
        val communityId = requireNotNull(c.id)
        if (!isSuperAdmin && !membershipQuery.isActiveMember(communityId = communityId, userId = userId)) {
            throw CountdownAccessDeniedException()
        }
        val now = clock.instant()
        // No active edition is an invariant violation elsewhere, but here it reads the same as
        // "no date yet": there is nothing to count down to, so the display says so.
        val edition = communityQuery.activeEditionOf(communityId) ?: run {
            logger.warn { "community $communityId has no active edition — countdown shows no date" }
            return CountdownResponse(
                serverNow = now, startsAt = null,
                startsAtTimezone = CommunityEdition.DEFAULT_TIMEZONE, round = null, nextRound = null,
            )
        }
        val startsAt = edition.startsAt
            ?: return CountdownResponse(
                serverNow = now, startsAt = null,
                startsAtTimezone = edition.startsAtTimezone, round = null, nextRound = null,
            )
        val zone = ZoneId.of(edition.startsAtTimezone)
        val current = engine.roundAt(now = now, startsAt = startsAt, zone = zone)
        // later in time = number - 1
        val next = engine.intervalOf(number = current.number - 1, startsAt = startsAt, zone = zone)
        return CountdownResponse(
            serverNow = now, startsAt = startsAt, startsAtTimezone = edition.startsAtTimezone,
            round = current.toDto(), nextRound = next.toDto(),
        )
    }
}
