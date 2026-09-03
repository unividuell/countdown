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
        file.writeText(
            """
            entries:
              - hue: 10
                saturation: 0.6
                lightness: 0.4
                generatedAt: 2026-08-16
                description: Beispieleintrag, kein Spielinhalt.
              - hue: 200
                saturation: 0.3
                lightness: 0.7
                generatedAt: 2024-03-03
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()

        loaded.isSample shouldBe false
        loaded.entries.size shouldBe 2
        loaded.origin shouldBe file.absolutePath
    }

    @Test
    fun `a configured file with a broken entry fails with the file's own path`(@TempDir dir: Path) {
        // The loader has no rules of its own any more, but the reader's do have to surface through
        // it naming the mounted file — that path is all the operator gets on a server.
        val file = dir.resolve("broken.yaml").toFile()
        file.writeText(
            """
            entries:
              - hue: 400
                saturation: 0.6
                lightness: 0.4
                generatedAt: 2026-08-16
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
        }

        thrown.message!! shouldContain file.absolutePath
        thrown.message!! shouldContain "0..359"
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
}
