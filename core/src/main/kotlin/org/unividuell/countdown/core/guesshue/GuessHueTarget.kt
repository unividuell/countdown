package org.unividuell.countdown.core.guesshue

/**
 * Eine gezogene Runde, vollständig — inklusive Lösung.
 *
 * [hue] ist die Antwort und darf den Server vor der Auswertung nicht verlassen, auch nicht
 * abgeleitet. Zum Client gehen ausschließlich [GuessHueEntry.description] sowie [initHue],
 * [saturation] und [lightness].
 */
data class GuessHueTarget(
    val entry: GuessHueEntry,
    val hue: Double,
    val saturation: Double,
    val lightness: Double,
    val initHue: Double,
)
