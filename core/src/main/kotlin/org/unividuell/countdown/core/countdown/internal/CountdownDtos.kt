package org.unividuell.countdown.core.countdown.internal

import org.unividuell.countdown.core.countdown.Round
import java.time.Instant

data class RoundDto(val number: Int, val label: String, val start: Instant, val end: Instant)
data class CountdownResponse(
    val serverNow: Instant,
    val startsAt: Instant?,
    val startsAtTimezone: String,
    val round: RoundDto?,
    val nextRound: RoundDto?,
)

fun Round.toDto() = RoundDto(number, label, start, end)
