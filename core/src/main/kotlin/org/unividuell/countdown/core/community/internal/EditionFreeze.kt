package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Instant
import java.time.ZoneId

/**
 * From when on this run's round grid is fixed.
 *
 * The moment is the start of round `gamesFromRound - 1`, the day before the first game round: the
 * daily schedule announces each round a day ahead, so that is the earliest instant a
 * `game.round_games` row can exist.
 *
 * Deliberately not `CountdownEngine.intervalOf`: `countdown` depends on `community`, never the other
 * way round. `EditionFreezeGridParityTest` pins this copy against the engine.
 */
fun frozenSince(edition: CommunityEdition): Instant =
    edition.startsAt.atZone(ZoneId.of(edition.startsAtTimezone))
        .plusDays(edition.gamesFromRound.toLong() - 2)
        .toInstant()

/**
 * When the run's first game round is over — the end of round `gamesFromRound`. A run may start at
 * once with the running round, but never with one that has already ended.
 */
fun firstGameRoundEnd(edition: CommunityEdition): Instant =
    edition.startsAt.atZone(ZoneId.of(edition.startsAtTimezone))
        .plusDays(edition.gamesFromRound.toLong())
        .toInstant()
