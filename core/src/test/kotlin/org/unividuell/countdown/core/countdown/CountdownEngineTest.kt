package org.unividuell.countdown.core.countdown

import io.kotest.assertions.withClue
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime

class CountdownEngineTest {
    private val engine = CountdownEngine()
    private val berlin = ZoneId.of("Europe/Berlin")
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int = 0, s: Int = 0) =
        ZonedDateTime.of(y, mo, d, h, mi, s, 0, berlin).toInstant()

    private val targetAt = at(2027, 6, 24, 11) // 2027-06-24 11:00 Europe/Berlin (MESZ)

    @Test
    fun `the anchor - one hour before the start is round 0 with an hour left`() {
        val now = at(2027, 6, 24, 10)
        val r = engine.roundAt(now, targetAt, berlin)
        r.number shouldBe 0
        r.end shouldBe targetAt
        Duration.between(now, r.end) shouldBe Duration.ofHours(1)
    }

    @Test
    fun `the start instant begins round 1`() {
        val r = engine.roundAt(targetAt, targetAt, berlin)
        r.number shouldBe 1
        r.start shouldBe targetAt
        r.end shouldBe at(2027, 6, 25, 11)
        engine.roundAt(at(2027, 6, 24, 10, 59, 59), targetAt, berlin).number shouldBe 0
    }

    @Test
    fun `round 0 begins one day before the start`() {
        engine.roundAt(at(2027, 6, 23, 11), targetAt, berlin).number shouldBe 0
        engine.roundAt(at(2027, 6, 23, 10, 59, 59), targetAt, berlin).number shouldBe -1
    }

    @Test
    fun `round -89 is the day 90 days before the start`() {
        val r = engine.intervalOf(-89, targetAt, berlin)
        r.start shouldBe at(2027, 3, 26, 11)
        r.end shouldBe at(2027, 3, 27, 11)
    }

    @Test
    fun `numbers rise with time and never skip`() {
        val instants = generateSequence(at(2027, 3, 20, 0)) { it.plus(Duration.ofHours(7)) }
            .takeWhile { it < at(2027, 7, 10, 0) }
        instants.map { engine.roundAt(it, targetAt, berlin).number }.zipWithNext().forEach { (earlier, later) ->
            (later - earlier) shouldBeInRange 0..1
        }
        (-100..20).forEach { n ->
            withClue("round $n") {
                engine.intervalOf(n, targetAt, berlin).end shouldBe engine.intervalOf(n + 1, targetAt, berlin).start
            }
        }
    }

    @Test
    fun `spring-forward day is exactly one round of 23 real hours`() {
        val springStart = at(2026, 3, 29, 11) // clocks jump 02->03 on 2026-03-29
        val r = engine.roundAt(at(2026, 3, 28, 12), springStart, berlin)
        r.number shouldBe 0
        r.start shouldBe at(2026, 3, 28, 11)
        r.end shouldBe springStart
        Duration.between(r.start, r.end) shouldBe Duration.ofHours(23)
    }

    @Test
    fun `fall-back day is exactly one round of 25 real hours`() {
        val fallStart = at(2026, 10, 25, 11) // clocks fall 03->02 on 2026-10-25
        val r = engine.roundAt(at(2026, 10, 24, 12), fallStart, berlin)
        r.number shouldBe 0
        r.start shouldBe at(2026, 10, 24, 11)
        r.end shouldBe fallStart
        Duration.between(r.start, r.end) shouldBe Duration.ofHours(25)
    }

    @Test
    fun `intervalOf is consistent with roundAt`() {
        val r = engine.intervalOf(-10, targetAt, berlin)
        r.start shouldBe at(2027, 6, 13, 11)
        r.end shouldBe at(2027, 6, 14, 11)
        engine.roundAt(r.start, targetAt, berlin) shouldBe r
        engine.intervalOf(-9, targetAt, berlin).start shouldBe r.end
    }
}
