package org.unividuell.countdown.core.countdown

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

    private val startsAt = at(2026, 6, 25, 11) // 2026-06-25 11:00 Europe/Berlin (= 09:00Z, summer)

    @Test
    fun `labels flip sign around the start`() {
        engine.labelOf(10) shouldBe "T-10"
        engine.labelOf(0) shouldBe "T-0"
        engine.labelOf(-1) shouldBe "T+1"
        engine.labelOf(-2) shouldBe "T+2"
    }

    @Test
    fun `the last day before start is round 0, start-inclusive`() {
        engine.roundAt(at(2026, 6, 24, 11), startsAt, berlin).number shouldBe 0
        engine.roundAt(at(2026, 6, 24, 11, 0, 1), startsAt, berlin).number shouldBe 0
        engine.roundAt(at(2026, 6, 25, 10, 59, 59), startsAt, berlin).number shouldBe 0
    }

    @Test
    fun `the start instant begins round -1 (T+1)`() {
        val r = engine.roundAt(startsAt, startsAt, berlin)
        r.number shouldBe -1
        r.label shouldBe "T+1"
        r.start shouldBe startsAt
        r.end shouldBe at(2026, 6, 26, 11)
        engine.roundAt(at(2026, 6, 25, 10, 59, 59), startsAt, berlin).number shouldBe 0
    }

    @Test
    fun `a day eleven days out is round 10`() {
        val r = engine.roundAt(at(2026, 6, 14, 11), startsAt, berlin)
        r.number shouldBe 10
        r.label shouldBe "T-10"
        r.start shouldBe at(2026, 6, 14, 11)
        r.end shouldBe at(2026, 6, 15, 11)
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
        val r = engine.intervalOf(10, startsAt, berlin)
        r.number shouldBe 10
        r.start shouldBe at(2026, 6, 14, 11)
        r.end shouldBe at(2026, 6, 15, 11)
        engine.intervalOf(9, startsAt, berlin).start shouldBe r.end
    }
}
