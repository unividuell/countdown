package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetValidator
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader

/**
 * The bundled sample must satisfy the same rules as the real dataset — otherwise the tests that
 * run against it prove nothing about the real thing.
 */
class GuessHueSampleDatasetTest {

    private val entries = GuessHueDatasetLoader::class.java
        .getResourceAsStream(GuessHueDatasetLoader.SAMPLE_RESOURCE)!!
        .use { GuessHueDatasetYamlReader.read(it, GuessHueDatasetLoader.SAMPLE_RESOURCE) }

    @Test
    fun `the bundled sample obeys the structural rules`() {
        shouldNotThrowAny {
            GuessHueDatasetValidator.validateStructure(entries, GuessHueDatasetLoader.SAMPLE_RESOURCE)
        }
    }

    @Test
    fun `the bundled sample is recognisably not game content`() {
        entries.size shouldBe 6
        entries.all { "Beispieleintrag" in it.description } shouldBe true
    }
}
