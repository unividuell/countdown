package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetValidator

class GuessHueDatasetValidatorTest {

    private fun easy(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt. Er steht praktisch auf dem reinen Rot, keinen Fingerbreit daneben.") =
        GuessHueEntry(hue, GuessHueDifficulty.EASY, description)

    private fun medium(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt. Er liegt auf der gruenen Seite von reinem Gelb, nicht auf der orangen.") =
        GuessHueEntry(hue, GuessHueDifficulty.MEDIUM, description)

    private fun hard(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt.") =
        GuessHueEntry(hue, GuessHueDifficulty.HARD, description)

    private fun structure(vararg entries: GuessHueEntry) =
        GuessHueDatasetValidator.validateStructure(entries.toList(), "test.yaml")

    @Test
    fun `accepts a well-formed set`() {
        shouldNotThrowAny { structure(easy(0), medium(60), hard(120)) }
    }

    @Test
    fun `rejects a duplicate hue`() {
        val thrown = shouldThrow<GuessHueDatasetException> { structure(easy(0), hard(0)) }
        thrown.message!! shouldContain "hue 0"
    }

    @Test
    fun `rejects a hue outside the circle`() {
        val thrown = shouldThrow<GuessHueDatasetException> { structure(hard(360)) }
        thrown.message!! shouldContain "0..359"
    }

    @Test
    fun `rejects a hard entry with two sentences`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(hard(10, "Beispieleintrag, kein Spielinhalt. Und noch ein Takt."))
        }
        thrown.message!! shouldContain "exactly one sentence"
    }

    @Test
    fun `rejects a medium entry with only one sentence`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(medium(10, "Beispieleintrag, kein Spielinhalt."))
        }
        thrown.message!! shouldContain "at least two sentences"
    }

    @Test
    fun `rejects an easy entry without a measure word`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(easy(10, "Beispieleintrag, kein Spielinhalt. Er liegt neben dem reinen Rot, nicht daneben."))
        }
        thrown.message!! shouldContain "measure word"
    }

    @Test
    fun `rejects a digit in the description`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(hard(10, "Beispieleintrag mit 30 Grad, kein Spielinhalt."))
        }
        thrown.message!! shouldContain "digit"
    }

    @Test
    fun `completeness rejects a set that is not sixty entries`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetValidator.validateCompleteness(listOf(easy(0)), "test.yaml")
        }
        thrown.message!! shouldContain "60"
    }

    @Test
    fun `completeness accepts a balanced set of sixty`() {
        // Fuenf pro 30-Grad-Sektor, 20 pro Stufe. Die Verteilung je Sektor ist bewusst UNGLEICH —
        // eine gleiche waere gar nicht moeglich (5 ist nicht durch 3 teilbar) und traefe auch die
        // Sache nicht: namenlose Zonen koennen nie easy tragen. Drei Muster rotieren ueber die
        // zwoelf Sektoren, vier Sektoren je Muster, und ergeben genau 20/20/20.
        val entries = (0 until 12).flatMap { sector ->
            val base = sector * 30
            val difficulties = when (sector % 3) {
                0 -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD)
                1 -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD, GuessHueDifficulty.HARD)
                else -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD, GuessHueDifficulty.HARD)
            }
            difficulties.mapIndexed { index, difficulty ->
                val hue = base + 2 + index * 6
                when (difficulty) {
                    GuessHueDifficulty.EASY -> easy(hue)
                    GuessHueDifficulty.MEDIUM -> medium(hue)
                    GuessHueDifficulty.HARD -> hard(hue)
                }
            }
        }
        shouldNotThrowAny { GuessHueDatasetValidator.validateCompleteness(entries, "test.yaml") }
        shouldNotThrowAny { GuessHueDatasetValidator.validateStructure(entries, "test.yaml") }
    }
}
