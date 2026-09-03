package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader
import java.time.LocalDate

class GuessHueDatasetYamlReaderTest {

    private fun read(yaml: String) =
        GuessHueDatasetYamlReader.read(yaml.byteInputStream(), origin = "test.yaml")

    @Test
    fun `reads hue, saturation, lightness, generatedAt and description`() {
        val entries = read(
            """
            entries:
              - hue: 0
                saturation: 0.72
                lightness: 0.45
                generatedAt: 2026-08-16
                description: >-
                  Beispieleintrag Alpha, kein Spielinhalt. Er sagt über Farben
                  nichts aus.
              - hue: 359
                saturation: 0.1
                lightness: 0.9
                generatedAt: 2024-03-03
                description: Beispieleintrag Gamma, kein Spielinhalt.
            """.trimIndent(),
        )

        entries.size shouldBe 2
        entries[0].hue shouldBe 0
        entries[0].saturation shouldBe 0.72
        entries[0].lightness shouldBe 0.45
        entries[0].generatedAt shouldBe LocalDate.of(2026, 8, 16)
        // The folded block scalar `>-` turns the line breaks into spaces.
        entries[0].description shouldContain "kein Spielinhalt. Er sagt über Farben nichts aus."
        entries[1].hue shouldBe 359
        entries[1].generatedAt shouldBe LocalDate.of(2024, 3, 3)
    }

    @Test
    fun `reads a quoted date just as well as an unquoted one`() {
        // SnakeYAML resolves an unquoted 2024-03-03 to a java.util.Date (YAML 1.1 timestamps) and a
        // quoted one to a String. Both spellings mean the same thing to whoever edits the file by
        // hand, so both have to arrive as the same LocalDate.
        val entries = read(
            """
            entries:
              - hue: 10
                saturation: 0.5
                lightness: 0.5
                generatedAt: "2024-03-03"
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        entries[0].generatedAt shouldBe LocalDate.of(2024, 3, 3)
    }

    @Test
    fun `accepts the integer spellings of the fraction bounds`() {
        // YAML reads 0 and 1 as Int, 0.0 and 1.0 as Double. A hand-written file will contain both.
        val entries = read(
            """
            entries:
              - hue: 10
                saturation: 0
                lightness: 1
                description: Beispieleintrag, kein Spielinhalt.
                generatedAt: 2026-08-16
            """.trimIndent(),
        )

        entries[0].saturation shouldBe 0.0
        entries[0].lightness shouldBe 1.0
    }

    @Test
    fun `rejects a hue outside the wheel and names the entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 360
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "entry #0"
        thrown.message!! shouldContain "0..359"
    }

    @Test
    fun `rejects a saturation outside zero to one`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 1.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "saturation"
        thrown.message!! shouldContain "0.0..1.0"
    }

    @Test
    fun `rejects a missing lightness`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "lightness"
    }

    @Test
    fun `rejects a generatedAt that is not a date`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: "irgendwann"
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "generatedAt"
        thrown.message!! shouldContain "irgendwann"
    }

    @Test
    fun `rejects a blank description and points at the offending entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: "   "
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "entry #0"
        thrown.message!! shouldContain "description"
    }

    @Test
    fun `rejects a file without a top-level entries list`() {
        val thrown = shouldThrow<GuessHueDatasetException> { read("something: else") }

        thrown.message!! shouldContain "entries"
        thrown.message!! shouldContain "test.yaml"
    }
}
