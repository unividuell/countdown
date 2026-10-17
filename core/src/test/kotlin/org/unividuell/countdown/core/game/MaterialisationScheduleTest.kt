package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.MaterialisationSchedule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

/**
 * The run's loop on its own: which rounds it asks for, which it skips, and that one failure costs
 * nothing else. Persistence and the hooks are [MaterialisationScheduleBootTest]'s.
 */
class MaterialisationScheduleTest {

    /** 03:00 in Berlin (CEST), when the cron fires. */
    private val now = Instant.parse("2026-10-11T01:00:00Z")

    private val engine = CountdownEngine()
    private val communities = mockk<CommunityQuery>()
    private val store = mockk<RoundGameStore>()
    private val materialiser = mockk<RoundMaterialiser>()

    private val schedule = MaterialisationSchedule(
        communities = communities,
        engine = engine,
        store = store,
        materialiser = materialiser,
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )

    @BeforeEach
    fun nothingAnnouncedYet() {
        every { store.find(edition = any(), roundNumber = any()) } returns null
        every { materialiser.materialise(edition = any(), roundNumber = any()) } returns mockk<RoundGame>()
    }

    private fun anEdition(startsAt: Instant? = Instant.parse("2026-12-24T17:00:00Z")) = CommunityEdition(
        id = UUID.randomUUID(),
        communityId = UUID.randomUUID(),
        label = "Run 2026",
        startsAt = startsAt,
    )

    private fun currentOf(edition: CommunityEdition): Int = engine.roundAt(
        now = now,
        startsAt = requireNotNull(edition.startsAt),
        zone = ZoneId.of(edition.startsAtTimezone),
    ).number

    @Test
    fun `the running and the next round are materialised when both are missing`() {
        val edition = anEdition()
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 2

        // A larger round number is earlier: the next round is `current - 1`.
        verify { materialiser.materialise(edition = edition, roundNumber = current) }
        verify { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `a round that already has a row is left alone, whoever wrote it`() {
        val edition = anEdition()
        val current = currentOf(edition)
        every { store.find(edition = edition, roundNumber = current - 1) } returns mockk<RoundGame>()

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `on the window's last round the next one is not materialised`() {
        val dated = anEdition()
        val edition = dated.copy(gamesUntilRound = currentOf(dated))
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify { materialiser.materialise(edition = edition, roundNumber = current) }
        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `the day before the window only its first round is materialised`() {
        val dated = anEdition()
        val edition = dated.copy(gamesFromRound = currentOf(dated) - 1)
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current) }
        verify { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `after the window nothing is materialised`() {
        val dated = anEdition()
        val current = currentOf(dated)
        val edition = dated.copy(gamesFromRound = current + 5, gamesUntilRound = current + 1)

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify(exactly = 0) { materialiser.materialise(edition = any(), roundNumber = any()) }
    }

    @Test
    fun `a run without a date has no grid to prepare`() {
        val edition = anEdition(startsAt = null)

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify(exactly = 0) { materialiser.materialise(edition = any(), roundNumber = any()) }
    }

    @Test
    fun `a failed running round holds the next one back, not the next edition`() {
        val failing = anEdition()
        val healthy = anEdition()
        val failingCurrent = currentOf(failing)
        val healthyCurrent = currentOf(healthy)
        every { communities.activeEditions() } returns listOf(failing, healthy)
        every {
            materialiser.materialise(edition = failing, roundNumber = failingCurrent)
        } throws IllegalStateException("preview download failed")

        schedule.run()

        // The draw only looks back: announced before its predecessor, tomorrow could repeat today's game.
        verify(exactly = 0) { materialiser.materialise(edition = failing, roundNumber = failingCurrent - 1) }
        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent) }
        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent - 1) }
    }

    @Test
    fun `a running round without a game holds the next one back`() {
        val edition = anEdition()
        val current = currentOf(edition)
        every { materialiser.materialise(edition = edition, roundNumber = current) } returns null

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `a failing lookup does not stop the next edition`() {
        val failing = anEdition()
        val healthy = anEdition()
        val healthyCurrent = currentOf(healthy)
        every { communities.activeEditions() } returns listOf(failing, healthy)
        every { store.find(edition = failing, roundNumber = any()) } throws IllegalStateException("connection reset")

        schedule.run()

        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent) }
        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent - 1) }
    }
}
