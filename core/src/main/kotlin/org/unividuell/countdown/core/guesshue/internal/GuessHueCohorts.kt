package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry

/**
 * `GuessHueEntry.generatedAt`'s only reader, and the reason the field is in the schema rather than
 * in a YAML comment: the startup line reports how the set is composed, so a dataset that lost half
 * of itself in a bad merge says so out loud instead of quietly playing on.
 *
 * Its own object rather than a private helper in `GuessHueDatasetConfiguration` so the format is
 * testable without asserting on a log appender.
 */
object GuessHueCohorts {

    /** Oldest cohort first — the line is read to see how the set grew over time. */
    fun summarise(entries: List<GuessHueEntry>): String = entries
        .groupingBy { it.generatedAt }
        .eachCount()
        .toSortedMap()
        .entries
        .joinToString { (date, count) -> "$count from $date" }
}
