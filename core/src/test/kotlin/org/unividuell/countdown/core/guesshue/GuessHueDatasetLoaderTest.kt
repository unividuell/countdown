package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties
import java.nio.file.Path

class GuessHueDatasetLoaderTest {

    @Test
    fun `falls back to the bundled sample when no path is configured`() {
        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = "")).load()

        loaded.isSample shouldBe true
        loaded.entries.size shouldBe 6
        loaded.origin shouldBe GuessHueDatasetLoader.SAMPLE_RESOURCE
    }

    @Test
    fun `reads the configured file and reports it as not the sample`(@TempDir dir: Path) {
        val file = dir.resolve("dataset.yaml").toFile()
        file.writeText(sixtyBalancedEntriesAsYaml())

        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()

        loaded.isSample shouldBe false
        loaded.entries.size shouldBe 60
        loaded.origin shouldBe file.absolutePath
    }

    @Test
    fun `fails when the configured path is not a readable file`(@TempDir dir: Path) {
        val missing = dir.resolve("absent.yaml").toAbsolutePath().toString()

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = missing)).load()
        }

        thrown.message!! shouldContain missing
        thrown.message!! shouldContain "app.guess-hue.dataset-path"
    }

    @Test
    fun `applies the completeness rule to a configured file`(@TempDir dir: Path) {
        val file = dir.resolve("short.yaml").toFile()
        file.writeText(
            """
            entries:
              - hue: 0
                difficulty: hard
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
        }

        thrown.message!! shouldContain "expected 60 entries"
    }

    /**
     * Five per sector, 20 per difficulty — invented text that satisfies the rules. The
     * distribution per sector is uneven because five doesn't divide by three: three patterns
     * rotate across the twelve sectors, four sectors per pattern, adding up to exactly 20/20/20.
     */
    private fun sixtyBalancedEntriesAsYaml(): String = buildString {
        appendLine("entries:")
        (0 until 12).forEach { sector ->
            val base = sector * 30
            val difficulties = when (sector % 3) {
                0 -> listOf("easy", "easy", "medium", "medium", "hard")
                1 -> listOf("easy", "easy", "medium", "hard", "hard")
                else -> listOf("easy", "medium", "medium", "hard", "hard")
            }
            difficulties.forEachIndexed { index, difficulty ->
                val description = when (difficulty) {
                    "easy" -> "Beispieleintrag, kein Spielinhalt. Er steht praktisch daneben, keinen Fingerbreit weiter."
                    "medium" -> "Beispieleintrag, kein Spielinhalt. Er liegt auf der einen Seite, nicht auf der anderen."
                    else -> "Beispieleintrag, kein Spielinhalt."
                }
                appendLine("  - hue: ${base + 2 + index * 6}")
                appendLine("    difficulty: $difficulty")
                appendLine("    description: \"$description\"")
            }
        }
    }
}
