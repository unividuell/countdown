package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader

class GuessHueDatasetYamlReaderTest {

    private fun read(yaml: String) =
        GuessHueDatasetYamlReader.read(yaml.byteInputStream(), origin = "test.yaml")

    @Test
    fun `reads hue, difficulty and description`() {
        val entries = read(
            """
            entries:
              - hue: 0
                difficulty: easy
                description: >-
                  Beispieleintrag Alpha, kein Spielinhalt. Er steht praktisch auf dem
                  reinen Rot, keinen Fingerbreit daneben.
              - hue: 120
                difficulty: hard
                description: Beispieleintrag Gamma, kein Spielinhalt.
            """.trimIndent(),
        )

        entries.size shouldBe 2
        entries[0].hue shouldBe 0
        entries[0].difficulty shouldBe GuessHueDifficulty.EASY
        // Der Faltblock `>-` macht aus den Zeilenumbrüchen Leerzeichen.
        entries[0].description shouldContain "reinen Rot, keinen Fingerbreit daneben."
        entries[1].difficulty shouldBe GuessHueDifficulty.HARD
    }

    @Test
    fun `rejects an unknown difficulty and names the allowed values`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    difficulty: tricky
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "tricky"
        thrown.message!! shouldContain "easy"
    }

    @Test
    fun `rejects a blank description and points at the offending entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    difficulty: hard
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
