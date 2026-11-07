package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.firstGameRoundEnd
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

    private fun assertMatchesEngine(targetAt: Instant, zone: String, gamesFromRound: Int) {
        val edition = anEdition(
            communityId = UUID.randomUUID(),
            targetAt = targetAt,
            targetTimezone = zone,
            gamesFromRound = gamesFromRound,
        )

        frozenSince(edition) shouldBe engine.intervalOf(
            number = gamesFromRound - 1,
            targetAt = targetAt,
            zone = ZoneId.of(zone),
        ).start

        firstGameRoundEnd(edition) shouldBe engine.intervalOf(
            number = gamesFromRound,
            targetAt = targetAt,
            zone = ZoneId.of(zone),
        ).end
    }

    @Test
    fun `the freeze point is the engine's start of the round before the first game round`() {
        assertMatchesEngine(
            targetAt = Instant.parse("2026-06-25T09:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = -24,
        )
    }

    @Test
    fun `still the engine's answer across a DST boundary`() {
        assertMatchesEngine(
            targetAt = Instant.parse("2026-04-05T16:00:00Z"),
            zone = "Europe/Berlin",
            gamesFromRound = -9,
        )
    }

    @Test
    fun `still the engine's answer in a zone that is not the default`() {
        assertMatchesEngine(
            targetAt = Instant.parse("2026-11-10T14:00:00Z"),
            zone = "America/New_York",
            gamesFromRound = -30,
        )
    }
}
