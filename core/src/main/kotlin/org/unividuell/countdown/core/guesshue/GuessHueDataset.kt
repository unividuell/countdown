package org.unividuell.countdown.core.guesshue

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * Die geladene, geprüfte Liste. Die öffentliche Fläche des Moduls: der spätere Spielrahmen
 * bekommt diesen Bean und zieht daraus die Runde.
 *
 * Unveränderlich und ohne Zustand — der Zufall lebt im übergebenen [SeededRandom], nie hier.
 */
class GuessHueDataset(val entries: List<GuessHueEntry>) {

    /**
     * **Die Reihenfolge der Ziehungen ist Vertrag.** Eintrag, Jitter, Sättigung, Helligkeit,
     * Startwinkel — wer sie umstellt, ändert rückwirkend jede Runde, die je aus einem Seed
     * abgeleitet wurde.
     *
     * Nur die vorhandene [SeededRandom]-API wird benutzt. Eine neue Methode dort zöge neue Golden
     * Vectors nach sich, und das für Arithmetik, die hierher gehört.
     */
    fun draw(random: SeededRandom): GuessHueTarget {
        val entry = random.pick(entries)
        val jittered = entry.hue + random.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES
        val saturation = SATURATION_MIN + random.nextDouble() * (SATURATION_MAX - SATURATION_MIN)
        val lightness = LIGHTNESS_MIN + random.nextDouble() * (LIGHTNESS_MAX - LIGHTNESS_MIN)
        val initHue = random.nextDouble() * 360.0

        return GuessHueTarget(
            entry = entry,
            hue = wrap360(jittered),
            saturation = saturation,
            lightness = lightness,
            initHue = initHue,
        )
    }

    private fun wrap360(degrees: Double) = ((degrees % 360.0) + 360.0) % 360.0

    companion object {
        /**
         * Muss kleiner bleiben als die Wertungstoleranz von ±10°. Der Jitter macht eine aus
         * beobachteten Runden gebaute Nachschlagetabelle unzuverlässig; wäre er größer als die
         * Toleranz, könnte ein perfekter Leser des Textes unverschuldet danebenliegen.
         */
        const val JITTER_DEGREES = 5.0

        /**
         * Außerhalb dieses Korridors wird der Farbton auf dem Rad schwer unterscheidbar — ein sehr
         * dunkles oder ausgewaschenes Ziel macht das Spiel nicht schwerer, sondern zufälliger.
         */
        const val SATURATION_MIN = 0.50
        const val SATURATION_MAX = 0.78
        const val LIGHTNESS_MIN = 0.38
        const val LIGHTNESS_MAX = 0.52
    }
}
