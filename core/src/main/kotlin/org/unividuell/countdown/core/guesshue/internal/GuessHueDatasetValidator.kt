package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry

/**
 * The spec's writing rules as code. They cannot recognize bad prose — they catch the most common
 * mistake instead: an entry marked `easy` that is missing the calibrating second sentence.
 *
 * All violations of a list are collected and reported together. A validator that aborts on the
 * first hit would force the author through as many runs as they made mistakes.
 */
object GuessHueDatasetValidator {

    const val EXPECTED_SIZE = 60
    const val EXPECTED_PER_DIFFICULTY = 20
    const val EXPECTED_PER_SECTOR = 5
    const val SECTOR_WIDTH_DEGREES = 30

    /** Closes the window of an `easy` description. Without one of these, it isn't easy. */
    private val MEASURE_WORDS = listOf(
        "Hauch", "Fingerbreit", "Handbreit", "Drittel", "Hälfte",
        "Schritt", "kaum", "knapp", "praktisch", "dicht",
    )

    /** Sentence end: at least two letters, then punctuation, then whitespace or end of text. That
     *  way an abbreviation's period doesn't count (e.g. "z. B."), but a closing period does. */
    private val SENTENCE_END = Regex("\\p{L}{2,}[.!?](?=\\s|\\z)")
    private val DIGIT = Regex("\\d")

    /** Measure-word matchers for `easy`, precompiled with word boundaries — derived from
     *  MEASURE_WORDS rather than kept as a second list, otherwise the check and the error message
     *  (which quotes MEASURE_WORDS directly) could drift apart unnoticed. */
    private val MEASURE_WORD_MATCHERS = MEASURE_WORDS.map { Regex("\\b" + Regex.escape(it) + "\\b") }

    /** Rules 2–5. Applies to every loaded list, including the sample dataset. */
    fun validateStructure(entries: List<GuessHueEntry>, origin: String) {
        val problems = mutableListOf<String>()

        entries.groupBy { it.hue }
            .filterValues { it.size > 1 }
            .keys.sorted()
            .forEach { problems += "hue $it appears more than once" }

        entries.forEach { entry ->
            val where = "hue ${entry.hue}"
            val difficulty = entry.difficulty.name.lowercase()

            if (entry.hue !in 0..359) {
                problems += "$where: hue must be within 0..359"
            }

            val sentences = SENTENCE_END.findAll(entry.description).count()
            if (entry.difficulty == GuessHueDifficulty.HARD) {
                if (sentences != 1) {
                    problems += "$where: hard needs exactly one sentence, found $sentences"
                }
            } else if (sentences < 2) {
                problems += "$where: $difficulty needs at least two sentences, found $sentences"
            }

            if (entry.difficulty == GuessHueDifficulty.EASY &&
                MEASURE_WORD_MATCHERS.none { it.containsMatchIn(entry.description) }
            ) {
                problems += "$where: easy needs a measure word, one of ${MEASURE_WORDS.joinToString()}"
            }

            if (DIGIT.containsMatchIn(entry.description)) {
                problems += "$where: the description must not contain a digit — it paints, it does not compute"
            }
        }

        report(problems, origin)
    }

    /** Rule 1. Only for the production dataset — the sample deliberately has too few entries. */
    fun validateCompleteness(entries: List<GuessHueEntry>, origin: String) {
        val problems = mutableListOf<String>()

        if (entries.size != EXPECTED_SIZE) {
            problems += "expected $EXPECTED_SIZE entries, found ${entries.size}"
        }

        GuessHueDifficulty.entries.forEach { difficulty ->
            val found = entries.count { it.difficulty == difficulty }
            if (found != EXPECTED_PER_DIFFICULTY) {
                problems += "expected $EXPECTED_PER_DIFFICULTY ${difficulty.name.lowercase()} entries, found $found"
            }
        }

        (0 until 360 / SECTOR_WIDTH_DEGREES).forEach { sector ->
            val found = entries.count { it.hue / SECTOR_WIDTH_DEGREES == sector }
            if (found != EXPECTED_PER_SECTOR) {
                val from = sector * SECTOR_WIDTH_DEGREES
                problems += "sector $from..${from + SECTOR_WIDTH_DEGREES - 1} holds $found entries, expected $EXPECTED_PER_SECTOR"
            }
        }

        report(problems, origin)
    }

    private fun report(problems: List<String>, origin: String) {
        if (problems.isNotEmpty()) {
            throw GuessHueDatasetException(
                "$origin violates the dataset rules:\n" + problems.joinToString("\n") { "  - $it" },
            )
        }
    }
}
