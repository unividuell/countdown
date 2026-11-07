package org.unividuell.countdown.core.community

import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.frozenSince
import java.time.Instant
import java.util.UUID

class EditionFreezeTest {

    private fun edition(
        targetAt: Instant,
        zone: String = "Europe/Berlin",
        gamesFromRound: Int = -24,
    ) = anEdition(
        communityId = UUID.randomUUID(),
        targetAt = targetAt,
        targetTimezone = zone,
        gamesFromRound = gamesFromRound,
    )

    @Test
    fun `the freeze point is the start of the round before the first game round`() {
        // 17:00Z is 18:00 in Berlin (CET); round -31 starts 32 days earlier, same wall-clock.
        val e = edition(targetAt = Instant.parse("2026-12-20T17:00:00Z"), gamesFromRound = -30)

        frozenSince(e) shouldBe Instant.parse("2026-11-18T17:00:00Z")
    }

    @Test
    fun `the freeze point is the start of the round before the first game round in summer`() {
        // 09:00Z is 11:00 in Berlin (CEST); round -25 starts 26 days earlier, same wall-clock.
        val e = edition(targetAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = -24)

        frozenSince(e) shouldBe Instant.parse("2026-05-30T09:00:00Z")
    }

    @Test
    fun `day stepping is calendar-aware across a DST boundary`() {
        // 16:00Z is 18:00 in Berlin (CEST). Eleven days earlier is 2026-03-25, still CET (UTC+1),
        // so the same wall-clock 18:00 is 17:00Z — an instant-based minus(11 days) would say 16:00Z.
        val e = edition(targetAt = Instant.parse("2026-04-05T16:00:00Z"), gamesFromRound = -9)

        frozenSince(e) shouldBe Instant.parse("2026-03-25T17:00:00Z")
    }

    @Test
    fun `a window that opens only after the start freezes a day before the start`() {
        val e = edition(targetAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = 1)

        frozenSince(e) shouldBe Instant.parse("2026-06-24T09:00:00Z")
    }

    // `gamesFromRound - 2` must not run in Int: near Int.MIN_VALUE it wraps to a positive count, and
    // `plusDays` then adds days instead of subtracting — `isFrozen` would stay false forever.
    @Test
    fun `an enormous gamesFromRound still lands in the past, not millions of years in the future`() {
        val targetAt = Instant.parse("2026-06-25T09:00:00Z")
        val e = edition(targetAt = targetAt, gamesFromRound = -36500)

        frozenSince(e) shouldBeLessThan targetAt
    }
}
