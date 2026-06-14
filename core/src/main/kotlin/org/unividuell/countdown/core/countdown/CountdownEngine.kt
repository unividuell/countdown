package org.unividuell.countdown.core.countdown

import org.springframework.stereotype.Component
import java.time.Instant
import java.time.Period
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Pure, server-authoritative round engine. See .claude/guidelines/countdown.md.
 *   round n = [startsAt - (n+1) days, startsAt - n days)   (start-inclusive, zone-/DST-aware)
 * n = 0 is the last day before the start; n < 0 is at/after the start. Numbers decrease over time.
 * Day math is calendar-aware (ZonedDateTime.minus(Period)) so a DST day still counts as one round.
 */
@Component
class CountdownEngine {

    // T-0 (round 0) is real per the spec; there is no T+0. ASCII '-'/'+' are the label glyphs.
    fun labelOf(number: Int): String = if (number >= 0) "T-$number" else "T+${-number}"

    /** The round whose [start, end) interval contains [now] (start-inclusive). */
    fun roundAt(now: Instant, startsAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = startsAt.atZone(zone)
        fun boundary(k: Int): Instant = startZ.minus(roundLength.multipliedBy(k)).toInstant()
        // roundLength is the invariant daily grid: a whole-days Period (Period.ofDays(n)). The
        // day-estimate below assumes that; non-day Periods (months) would still terminate but iterate.
        val perDay = roundLength.days.coerceAtLeast(1)
        // k* = smallest k with boundary(k) <= now; the current round number is k* - 1.
        var k = (ChronoUnit.DAYS.between(now.atZone(zone).toLocalDate(), startZ.toLocalDate()) / perDay).toInt()
        while (boundary(k) > now) k++
        while (boundary(k - 1) <= now) k--
        return intervalOf(k - 1, startsAt, zone, roundLength)
    }

    /** The labelled [start, end) interval of round [number]. */
    fun intervalOf(number: Int, startsAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = startsAt.atZone(zone)
        val start = startZ.minus(roundLength.multipliedBy(number + 1)).toInstant()
        val end = startZ.minus(roundLength.multipliedBy(number)).toInstant()
        return Round(number, labelOf(number), start, end)
    }
}
