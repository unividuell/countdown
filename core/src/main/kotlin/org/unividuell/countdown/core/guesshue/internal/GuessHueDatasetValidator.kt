package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry

/**
 * Die Schreibregeln des Specs als Code. Sie können einen schlechten Text nicht erkennen — sie
 * fangen den häufigsten Fehler: einen als `easy` markierten Eintrag, dem der kalibrierende zweite
 * Takt fehlt.
 *
 * Alle Verstöße einer Liste werden gesammelt und gemeinsam gemeldet. Ein Validator, der beim ersten
 * Fund abbricht, zwingt den Autor durch so viele Durchläufe, wie er Fehler gemacht hat.
 */
object GuessHueDatasetValidator {

    const val EXPECTED_SIZE = 60
    const val EXPECTED_PER_DIFFICULTY = 20
    const val EXPECTED_PER_SECTOR = 5
    const val SECTOR_WIDTH_DEGREES = 30

    /** Schließt das Fenster einer `easy`-Beschreibung. Ohne eines davon ist sie nicht leicht. */
    private val MEASURE_WORDS = listOf(
        "Hauch", "Fingerbreit", "Handbreit", "Drittel", "Hälfte",
        "Schritt", "kaum", "knapp", "praktisch", "dicht",
    )

    /** Satzende: mindestens zwei Buchstaben, dann Zeichen, dann Leerraum oder Textende. Damit
     *  zählen Abkürzungspunkte nicht (z. B.), aber der Schlusspunkt tut es. */
    private val SENTENCE_END = Regex("\\p{L}{2,}[.!?](?=\\s|\\z)")
    private val DIGIT = Regex("\\d")

    /** Maßwörter für `easy` als vorkompilierte Regex mit Wortgrenzen — aus MEASURE_WORDS
     *  abgeleitet statt einer zweiten Liste, sonst könnten Prüfung und Fehlermeldung
     *  (die MEASURE_WORDS direkt zitiert) unbemerkt auseinanderlaufen. */
    private val MEASURE_WORD_MATCHERS = MEASURE_WORDS.map { Regex("\\b" + Regex.escape(it) + "\\b") }

    /** Regeln 2–5. Gilt für jede geladene Liste, auch das Beispiel-Datenset. */
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

    /** Regel 1. Nur für das Produktionsdatenset — das Beispiel hat bewusst zu wenige Einträge. */
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
