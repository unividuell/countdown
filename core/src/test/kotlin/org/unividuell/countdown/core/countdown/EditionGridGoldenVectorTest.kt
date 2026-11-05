package org.unividuell.countdown.core.countdown

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

/**
 * Pins [CountdownEngine] to the committed vectors. `editionGrid.spec.ts` asserts the browser
 * calculation against the same file.
 *
 * Regenerate after an intentional change of the round arithmetic:
 * `./mvnw test -Dtest=EditionGridGoldenVectorTest -Dedition.vectors.write=true`
 */
class EditionGridGoldenVectorTest {

    @Test
    fun `engine matches the shared edition grid vectors`() {
        val generated = EditionGridVectors.build()

        if (System.getProperty("edition.vectors.write") == "true") {
            EditionGridVectors.FILE.parentFile.mkdirs()
            val json = EditionGridVectors.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated)
            EditionGridVectors.FILE.writeText(json + "\n")
        }

        EditionGridVectors.FILE.exists() shouldBe true
        val committed = EditionGridVectors.mapper.readValue(
            EditionGridVectors.FILE,
            EditionGridVectors.Vectors::class.java,
        )

        committed.version shouldBe EditionGridVectors.VERSION
        committed.roundStart shouldBe generated.roundStart
        committed.roundAt shouldBe generated.roundAt
    }
}
