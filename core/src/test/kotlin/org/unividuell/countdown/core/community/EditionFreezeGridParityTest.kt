package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.frozenSince
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * `community` cannot call `CountdownEngine` (that would invert the module dependency), so the freeze
 * point is computed twice. This test is what keeps the two answers one answer.
 */
class EditionFreezeGridParityTest {

    private val engine = CountdownEngine()

    private fun assertMatchesEngine(startsAt: Instant, zone: String, gamesFromRound: Int) {
        val edition = CommunityEdition(
            communityId = UUID.randomUUID(),
            label = "Run 2026",
            startsAt = startsAt,
            startsAtTimezone = zone,
            gamesFromRound = gamesFromRound,
        )

        frozenSince(edition) shouldBe engine.intervalOf(
            number = gamesFromRound,
            startsAt = startsAt,
            zone = ZoneId.of(zone),
        ).start
    }

    @Test
    fun `the freeze point is the engine's start of that round`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-06-25T09:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = 24,
        )
    }

    @Test
    fun `still the engine's answer across a DST boundary`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-04-05T16:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = 9,
        )
    }

    @Test
    fun `still the engine's answer in a zone that is not the default`() {
        assertMatchesEngine(
            startsAt = Instant.parse("2026-11-10T14:00:00Z"),
            zone = "America/New_York",
            gamesFromRound = 30,
        )
    }
}
