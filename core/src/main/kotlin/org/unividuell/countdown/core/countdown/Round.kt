package org.unividuell.countdown.core.countdown

import java.time.Instant

/** A round: its number (rising with time, `0` = the last day before the start) and half-open [start, end) interval. */
data class Round(val number: Int, val start: Instant, val end: Instant)
