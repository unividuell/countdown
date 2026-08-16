package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueCohorts
import java.time.LocalDate

class GuessHueCohortsTest {

    private fun entry(generatedAt: LocalDate) = GuessHueEntry(
        hue = 0,
        saturation = 0.5,
        lightness = 0.5,
        generatedAt = generatedAt,
        description = "Beispieleintrag, kein Spielinhalt.",
    )

    @Test
    fun `counts the entries per cohort, oldest first`() {
        val entries = listOf(
            entry(LocalDate.of(2026, 8, 16)),
            entry(LocalDate.of(2024, 3, 3)),
            entry(LocalDate.of(2026, 8, 16)),
            entry(LocalDate.of(2024, 3, 3)),
            entry(LocalDate.of(2024, 3, 3)),
        )

        // Chronological, not insertion order: the line is read to see how the set grew.
        GuessHueCohorts.summarise(entries) shouldBe "3 from 2024-03-03, 2 from 2026-08-16"
    }

    @Test
    fun `says so plainly when every entry comes from one day`() {
        GuessHueCohorts.summarise(listOf(entry(LocalDate.of(2024, 3, 3)))) shouldBe "1 from 2024-03-03"
    }
}
