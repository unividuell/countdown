package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties
import java.io.File

/**
 * Prüft das **echte** Datenset gegen alle fünf Regeln — und läuft nur, wenn jemand den Klartext
 * hat und darauf zeigt:
 *
 * ```
 * ./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=../.local/guess-hue-dataset.yaml
 * ```
 *
 * Ohne die Property überspringt der Test sich selbst, damit die CI grün bleibt — sie hat den
 * Klartext nicht und soll ihn nicht haben.
 *
 * Bewusst ein Test und kein eigenes Prüfskript: die Regeln leben in
 * `GuessHueDatasetValidator` und sollen es an genau einer Stelle tun. Eine zweite Umsetzung in
 * einer anderen Sprache driftet, und zwar unbemerkt, weil beide Seiten grün bleiben.
 */
class GuessHueProductionDatasetTest {

    @Test
    fun `the production dataset obeys every rule`() {
        val path = System.getProperty("guesshue.dataset")
        assumeTrue(path != null, "set -Dguesshue.dataset=<path> to check the real dataset")

        val file = File(path!!)
        assumeTrue(file.isFile, "no dataset at $path")

        shouldNotThrowAny {
            val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
            loaded.entries.size shouldBe 60
        }
    }
}
