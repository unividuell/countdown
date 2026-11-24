package org.unividuell.countdown.core.mixcolor

import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.mixcolor.internal.Spectral
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File

class MixingGoldenVectorTest {

    data class Mix(val recipe: Map<String, Int>, val hex: String, val oklab: List<Double>)
    data class Distance(val a: String, val b: String, val deltaE: Double)
    data class Vectors(val mixes: List<Mix>, val deltaE: List<Distance>)

    /** Relative to the module directory, Maven's working directory. Written by spectral.js 3.0.0 itself. */
    private val vectors =
        jacksonObjectMapper().readValue(File("../shared/mix-color/spectral-vectors.json"), Vectors::class.java)

    private fun recipe(keys: Map<String, Int>): Map<Pigment, Int> =
        keys.entries.associate { (key, count) -> Pigment.ofKey(key)!! to count }

    @Test
    fun `every mix matches spectral js`() {
        vectors.mixes.forEach { mix -> mixHex(recipe(mix.recipe)) shouldBe mix.hex }
    }

    @Test
    fun `oklab of every mix matches`() {
        vectors.mixes.forEach { mix ->
            val oklab = Spectral.oklabOf(mix.hex)
            mix.oklab.forEachIndexed { i, expected -> oklab[i] shouldBe (expected plusOrMinus 1e-9) }
        }
    }

    @Test
    fun `every deltaE matches`() {
        vectors.deltaE.forEach { d -> deltaE(d.a, d.b) shouldBe (d.deltaE plusOrMinus 1e-9) }
    }

    @Test
    fun `an empty recipe has no colour`() {
        mixHex(emptyMap()).shouldBeNull()
        mixHex(mapOf(Pigment.CYAN to 0)).shouldBeNull()
    }

    @Test
    fun `ratios mix identically`() {
        mixHex(mapOf(Pigment.CYAN to 1, Pigment.MAGENTA to 1)) shouldBe
            mixHex(mapOf(Pigment.CYAN to 2, Pigment.MAGENTA to 2))
    }
}
