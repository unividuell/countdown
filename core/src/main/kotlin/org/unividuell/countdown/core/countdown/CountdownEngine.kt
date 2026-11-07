package org.unividuell.countdown.core.countdown

import org.springframework.stereotype.Component
import java.time.Instant
import java.time.Period
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Pure, server-authoritative round engine. See .claude/guidelines/countdown.md.
 *   round n = [targetAt + (n-1) days, targetAt + n days)   (start-inclusive, zone-/DST-aware)
 * n = 0 is the last day before the start; n > 0 is at/after the start. Numbers rise over time.
 * Day math is calendar-aware (ZonedDateTime.plus(Period)) so a DST day still counts as one round.
 */
@Component
class CountdownEngine {

    /** The round whose [start, end) interval contains [now] (start-inclusive). */
    fun roundAt(now: Instant, targetAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = targetAt.atZone(zone)
        fun boundary(k: Int): Instant = startZ.plus(roundLength.multipliedBy(k)).toInstant()
        // roundLength is the invariant daily grid: a whole-days Period (Period.ofDays(n)). The
        // day-estimate below assumes that; non-day Periods (months) would still terminate but iterate.
        val perDay = roundLength.days.coerceAtLeast(1)
        // k* = largest k with boundary(k) <= now; the current round number is k* + 1.
        var k = (ChronoUnit.DAYS.between(startZ.toLocalDate(), now.atZone(zone).toLocalDate()) / perDay).toInt()
        while (boundary(k) > now) k--
        while (boundary(k + 1) <= now) k++
        return intervalOf(k + 1, targetAt, zone, roundLength)
    }

    /** The [start, end) interval of round [number]. */
    fun intervalOf(number: Int, targetAt: Instant, zone: ZoneId, roundLength: Period = Period.ofDays(1)): Round {
        val startZ = targetAt.atZone(zone)
        val start = startZ.plus(roundLength.multipliedBy(number - 1)).toInstant()
        val end = startZ.plus(roundLength.multipliedBy(number)).toInstant()
        return Round(number, start, end)
    }
}
