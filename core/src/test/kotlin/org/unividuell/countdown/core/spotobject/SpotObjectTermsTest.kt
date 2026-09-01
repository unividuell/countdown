package org.unividuell.countdown.core.spotobject

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.spotobject.internal.SpotObjectException
import org.unividuell.countdown.core.spotobject.internal.SpotObjectTermsYamlReader

class SpotObjectTermsTest {

    private fun read(yaml: String) =
        SpotObjectTermsYamlReader.read(yaml.byteInputStream(), "test")

    @Test
    fun `it reads a list of terms`() {
        read("terms:\n  - Rosa Gartenzwerg\n  - Umgedrehtes Fahrrad\n") shouldBe
            listOf("Rosa Gartenzwerg", "Umgedrehtes Fahrrad")
    }

    /** Mechanically wrong is checked; whether a term is any *good* is looked at, never asserted. */
    @Test
    fun `it rejects an empty list and a blank term`() {
        shouldThrow<SpotObjectException> { read("terms: []\n") }
        shouldThrow<SpotObjectException> { read("terms:\n  - \"  \"\n") }
    }

    @Test
    fun `it rejects a duplicate, which is a copy-paste slip rather than a matter of taste`() {
        shouldThrow<SpotObjectException> { read("terms:\n  - Gnom\n  - Gnom\n") }
    }

    @Test
    fun `the draw comes from the presentation stream and is reproducible`() {
        val terms = SpotObjectTerms(listOf("a", "b", "c", "d"))

        terms.draw(SeededRandom.fromSeed(7)) shouldBe terms.draw(SeededRandom.fromSeed(7))
        terms.terms shouldContain terms.draw(SeededRandom.fromSeed(99))
    }

    @Test
    fun `the bundled sample parses`() {
        val stream = requireNotNull(
            javaClass.getResourceAsStream("/spot-object-terms.sample.yaml"),
        )
        stream.use { SpotObjectTermsYamlReader.read(it, "sample").size shouldBe 12 }
    }
}
