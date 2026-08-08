package org.unividuell.countdown.core.guesshue

/**
 * Autoren-Metadatum, kein Laufzeitschalter. Zur Spielzeit liest niemand dieses Feld — die Stufen
 * fallen allein aus der Datenlage, weil der Seed gleichverteilt über alle Einträge zieht. Es
 * existiert, damit die Zweitakt-Regel des Specs prüfbar ist statt Geschmackssache.
 */
enum class GuessHueDifficulty { EASY, MEDIUM, HARD }

/**
 * Ein Eintrag ist eine Farb*familie*, kein Farbwert: [hue] ist der **nominale** Winkel, um den die
 * Runde jittert, und Sättigung wie Helligkeit gehören gar nicht dazu — sie entstehen pro Runde.
 *
 * Siehe `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`.
 */
data class GuessHueEntry(
    val hue: Int,
    val difficulty: GuessHueDifficulty,
    val description: String,
)
