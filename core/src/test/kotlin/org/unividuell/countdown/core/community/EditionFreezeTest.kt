package org.unividuell.countdown.core.community

import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.frozenSince
import java.time.Instant
import java.util.UUID

class EditionFreezeTest {

    private fun edition(
        startsAt: Instant?,
        zone: String = "Europe/Berlin",
        gamesFromRound: Int? = 24,
    ) = CommunityEdition(
        communityId = UUID.randomUUID(),
        label = "Run 2026",
        startsAt = startsAt,
        startsAtTimezone = zone,
        gamesFromRound = gamesFromRound,
    )

    @Test
    fun `without a date there is no grid to freeze`() {
        frozenSince(edition(startsAt = null)).shouldBeNull()
    }

    @Test
    fun `an unbounded window has no moment before the first playable round`() {
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = null)

        frozenSince(e) shouldBe Instant.MIN
    }

    @Test
    fun `the freeze point is the start of the first game round`() {
        // 09:00Z is 11:00 in Berlin (CEST); round 24 starts 25 days earlier, same wall-clock.
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = 24)

        frozenSince(e) shouldBe Instant.parse("2026-05-31T09:00:00Z")
    }

    @Test
    fun `day stepping is calendar-aware across a DST boundary`() {
        // 16:00Z is 18:00 in Berlin (CEST). Ten days earlier is 2026-03-26, still CET (UTC+1),
        // so the same wall-clock 18:00 is 17:00Z — an instant-based minus(10 days) would say 16:00Z.
        val e = edition(startsAt = Instant.parse("2026-04-05T16:00:00Z"), gamesFromRound = 9)

        frozenSince(e) shouldBe Instant.parse("2026-03-26T17:00:00Z")
    }

    @Test
    fun `a window that opens only after the start freezes at the start itself`() {
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = -1)

        frozenSince(e) shouldBe Instant.parse("2026-06-25T09:00:00Z")
    }

    // `gamesFromRound + 1` must not run in Int: at Int.MAX_VALUE it wraps to Int.MIN_VALUE, and
    // `minusDays` of a negative count adds days instead of subtracting — the freeze point then lands
    // millions of years in the future rather than in the past, and `isFrozen` is false forever.
    @Test
    fun `an enormous gamesFromRound still lands in the past, not millions of years in the future`() {
        val startsAt = Instant.parse("2026-06-25T09:00:00Z")
        val e = edition(startsAt = startsAt, gamesFromRound = Int.MAX_VALUE)

        val since = frozenSince(e)

        since.shouldNotBeNull()
        since shouldBeLessThan startsAt
    }
}
