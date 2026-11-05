package org.unividuell.countdown.core.community

import java.time.Instant
import java.util.UUID

/** A valid edition; every test overrides only the fields it asserts on. */
fun anEdition(
    communityId: UUID,
    label: String? = "Run 2026",
    startsAt: Instant = Instant.parse("2099-12-20T17:00:00Z"),
    startsAtTimezone: String = "Europe/Berlin",
    phaseTwoStartRound: Int? = null,
    gamesFromRound: Int = -30,
    gamesUntilRound: Int = 0,
    id: UUID? = null,
) = CommunityEdition(
    id = id,
    communityId = communityId,
    label = label,
    startsAt = startsAt,
    startsAtTimezone = startsAtTimezone,
    phaseTwoStartRound = phaseTwoStartRound,
    gamesFromRound = gamesFromRound,
    gamesUntilRound = gamesUntilRound,
)
