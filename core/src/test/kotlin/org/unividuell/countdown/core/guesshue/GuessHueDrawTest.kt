package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.comparables.shouldBeLessThanOrEqualTo
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.abs
import kotlin.math.min

class GuessHueDrawTest {

    private val dataset = GuessHueDataset(
        (0 until 12).flatMap { sector ->
            val base = sector * 30
            listOf(
                GuessHueEntry(base + 2, GuessHueDifficulty.EASY, "Beispieleintrag, kein Spielinhalt. Praktisch daneben, keinen Fingerbreit weiter."),
                GuessHueEntry(base + 14, GuessHueDifficulty.MEDIUM, "Beispieleintrag, kein Spielinhalt. Auf der einen Seite, nicht auf der anderen."),
                GuessHueEntry(base + 26, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt."),
            )
        },
    )

    private fun distanceOnCircle(a: Double, b: Double): Double {
        val raw = abs(a - b)
        return min(raw, 360.0 - raw)
    }

    @Test
    fun `draws entry, jitter, saturation, lightness and init hue in exactly that order`() {
        // Die Reihenfolge ist Vertrag: eine Umstellung aendert jede bereits gespielte Runde.
        // Deshalb gegen einen von Hand nachgezogenen Stream pruefen statt gegen Magic Numbers.
        val reference = SeededRandom.fromSeed("community-42/round-7")
        val expectedEntry = reference.pick(dataset.entries)
        val jitterDraw = reference.nextDouble()
        val saturationDraw = reference.nextDouble()
        val lightnessDraw = reference.nextDouble()
        val initDraw = reference.nextDouble()

        val target = dataset.draw(SeededRandom.fromSeed("community-42/round-7"))

        target.entry shouldBe expectedEntry
        // Die Klammerung muss die der Implementierung SPIEGELN, nicht nur denselben Wert meinen:
        // (0.78 - 0.50) ist in IEEE754 nicht dasselbe wie das Literal 0.28, und `shouldBe` auf
        // Double vergleicht exakt. Genau das soll es auch — der Test pinnt die Arithmetik.
        target.hue shouldBe (expectedEntry.hue + jitterDraw * (2 * 5.0) - 5.0)
            .let { ((it % 360.0) + 360.0) % 360.0 }
        target.saturation shouldBe 0.50 + saturationDraw * (0.78 - 0.50)
        target.lightness shouldBe 0.38 + lightnessDraw * (0.52 - 0.38)
        target.initHue shouldBe initDraw * 360.0
    }

    @Test
    fun `is reproducible for the same seed`() {
        val first = dataset.draw(SeededRandom.fromSeed(4711))
        val second = dataset.draw(SeededRandom.fromSeed(4711))

        second shouldBe first
    }

    @Test
    fun `keeps the jitter inside the tolerance and the colour inside the corridor`() {
        // Der Jitter muss kleiner bleiben als die Toleranz von plus/minus 10 Grad, sonst kann ein
        // perfekter Leser unverschuldet danebenliegen.
        (0 until 2_000).forEach { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))

            distanceOnCircle(target.hue, target.entry.hue.toDouble()) shouldBeLessThanOrEqualTo 5.0
            target.saturation shouldBeGreaterThanOrEqualTo 0.50
            target.saturation shouldBeLessThan 0.78
            target.lightness shouldBeGreaterThanOrEqualTo 0.38
            target.lightness shouldBeLessThan 0.52
            target.hue shouldBeGreaterThanOrEqualTo 0.0
            target.hue shouldBeLessThan 360.0
            target.initHue shouldBeGreaterThanOrEqualTo 0.0
            target.initHue shouldBeLessThan 360.0
        }
    }

    @Test
    fun `wraps the jitter across zero degrees`() {
        val nearZero = GuessHueDataset(
            listOf(GuessHueEntry(2, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt.")),
        )

        val hues = (0 until 500).map { nearZero.draw(SeededRandom.fromSeed(it)).hue }

        // Ein Nominalwert von 2 Grad jittert auf beide Seiten der Null, und keiner darf negativ werden.
        hues.any { it > 350.0 } shouldBe true
        hues.all { it >= 0.0 } shouldBe true
    }

    @Test
    fun `the init hue is drawn independently of the target`() {
        // Ein garantiert weit entfernter Start wuerde verraten, wo das Ziel NICHT liegt, und den
        // Suchraum von 360 auf 240 Grad schneiden. Also muss er auch mal nah dran landen.
        val close = (0 until 5_000).count { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))
            distanceOnCircle(target.initHue, target.hue) < 30.0
        }

        // Bei Gleichverteilung liegen rund ein Sechstel der Startwinkel innerhalb von 30 Grad:
        // Erwartungswert ~833, Standardabweichung ~34. Beide Grenzen sind noetig, nicht nur eine:
        // die Untergrenze (~10 Sigma tief) widerlegt einen garantiert entfernten Start (z. B.
        // initHue = wrap360(hue + 180)), die Obergrenze (~11 Sigma hoch) widerlegt einen an das
        // Ziel gekoppelten Start (z. B. initHue = hue oder initHue teilt sich eine Ziehung mit
        // lightness). Eine Grenze allein liesse genau die Klumpung durch, die die Unabhaengigkeit
        // eigentlich widerlegen soll.
        close shouldBeGreaterThanOrEqualTo 500
        close shouldBeLessThanOrEqualTo 1_200
    }
}
