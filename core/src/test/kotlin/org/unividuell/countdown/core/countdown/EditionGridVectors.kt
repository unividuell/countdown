package org.unividuell.countdown.core.countdown

import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File
import java.time.Instant
import java.time.ZoneId

/**
 * The edition grid's round arithmetic, expressed as data.
 *
 * [CountdownEngine] is the source of truth: [build] derives every expectation from it, and both
 * `EditionGridGoldenVectorTest` (JVM) and `editionGrid.spec.ts` (browser) assert against the same
 * file. The form shows unsaved values live, so the browser needs its own round calculation.
 */
object EditionGridVectors {

    const val VERSION = 1

    /** Resolved relative to the module directory, which is Maven's and Vitest's working directory. */
    val FILE: File = File("../shared/edition-grid/vectors.json")

    val mapper = jacksonObjectMapper()

    data class RoundStartCase(val targetAt: String, val zone: String, val round: Int, val roundStart: String)
    data class RoundAtCase(val now: String, val targetAt: String, val zone: String, val round: Int)

    data class Vectors(
        val version: Int,
        val note: String,
        val roundStart: List<RoundStartCase>,
        val roundAt: List<RoundAtCase>,
    )

    private data class Start(val targetAt: String, val zone: String, val rounds: IntRange)

    // Each start is chosen so its rounds straddle a DST change (a 23h or 25h day is one round).
    private val starts = listOf(
        Start("2027-06-24T09:00:00Z", "Europe/Berlin", -1..2),
        Start("2027-03-26T23:30:00Z", "Europe/Berlin", -1..4), // spring forward on 2027-03-28
        Start("2026-10-23T22:30:00Z", "Europe/Berlin", -1..4), // fall back on 2026-10-25
        Start("2027-03-12T15:00:00Z", "America/New_York", -1..4), // spring forward on 2027-03-14
        Start("2026-12-20T17:00:00Z", "Europe/Berlin", -45..1),
        Start("2027-06-24T09:00:00Z", "Europe/Berlin", -365..-363),
    )

    fun build(): Vectors {
        val engine = CountdownEngine()

        return Vectors(
            version = VERSION,
            note = "Generated from the JVM CountdownEngine. Regenerate with: ./mvnw test -Dtest=EditionGridGoldenVectorTest -Dedition.vectors.write=true",
            roundStart = starts.flatMap { s ->
                s.rounds.map { round ->
                    val interval = engine.intervalOf(round, Instant.parse(s.targetAt), ZoneId.of(s.zone))
                    RoundStartCase(s.targetAt, s.zone, round, interval.start.toString())
                }
            },
            // Every boundary, one millisecond either side of it: the start-inclusive edge is where
            // an off-by-one hides.
            roundAt = starts.flatMap { s ->
                s.rounds.flatMap { round ->
                    val interval = engine.intervalOf(round, Instant.parse(s.targetAt), ZoneId.of(s.zone))
                    listOf(interval.start.minusMillis(1), interval.start, interval.start.plusMillis(1))
                }.distinct().map { now ->
                    val at = engine.roundAt(now, Instant.parse(s.targetAt), ZoneId.of(s.zone))
                    RoundAtCase(now.toString(), s.targetAt, s.zone, at.number)
                }
            },
        )
    }
}
