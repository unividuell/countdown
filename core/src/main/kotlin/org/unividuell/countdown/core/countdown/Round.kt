package org.unividuell.countdown.core.countdown

import java.time.Instant

/** A round: its signed number, display label, and half-open [start, end) interval (start-inclusive). */
data class Round(val number: Int, val label: String, val start: Instant, val end: Instant)
