package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Instant
import java.time.ZoneId

/**
 * From when on this run's round grid is fixed — `null` while there is no grid at all.
 *
 * The moment is the start of round `gamesFromRound`, the earliest instant at which anyone could
 * announce a round and write a `game.round_games` row. An unbounded window (`gamesFromRound == null`)
 * has no such moment, so it answers [Instant.MIN] and every caller's `now >= frozenSince` holds.
 *
 * Deliberately not `CountdownEngine.intervalOf`: `countdown` depends on `community`, never the other
 * way round. `EditionFreezeGridParityTest` pins this copy against the engine.
 */
fun frozenSince(edition: CommunityEdition): Instant? {
    val startsAt = edition.startsAt ?: return null
    val firstGameRound = edition.gamesFromRound ?: return Instant.MIN
    return startsAt.atZone(ZoneId.of(edition.startsAtTimezone))
        .minusDays(firstGameRound.toLong() + 1)
        .toInstant()
}

/**
 * Human-readable form of [frozenSince] for error messages. The unbounded window's [Instant.MIN]
 * would otherwise print as a year with nine digits and a leading minus sign in a public 409 body.
 */
fun frozenSinceDescription(edition: CommunityEdition): String =
    when (val since = frozenSince(edition)) {
        Instant.MIN -> "its first round"
        else -> "$since"
    }
