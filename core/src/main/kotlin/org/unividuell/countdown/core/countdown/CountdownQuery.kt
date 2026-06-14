package org.unividuell.countdown.core.countdown

import java.time.Instant
import java.util.UUID

/** Read-only round lookup for other modules (e.g. future scoring). Null if the community has no startsAt. */
interface CountdownQuery {
    fun currentRound(communityId: UUID, now: Instant): Round?
}
