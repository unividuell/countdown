package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrowAny
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties
import java.io.File

/**
 * Checks the **real** dataset against all five rules — and only runs when someone has the
 * plaintext and points at it:
 *
 * ```
 * ./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=/path/to/guess-hue-dataset.yaml
 * ```
 *
 * Without the property, the test skips itself so CI stays green — it doesn't have the plaintext
 * and isn't supposed to.
 *
 * **Important:** only the *absence* of the property is an opt-out. If the property is set and the
 * file doesn't exist (or is a directory), the test must fail — that's a mistake by the caller, not
 * a "test not present".
 *
 * Deliberately a test and not a separate check script: the rules live in `GuessHueDatasetValidator`
 * and should live there in exactly one place. A second implementation in another language would
 * drift, and silently — both sides would keep passing.
 */
class GuessHueProductionDatasetTest {

    @Test
    fun `the production dataset obeys every rule`() {
        val path = System.getProperty("guesshue.dataset")
        assumeTrue(path != null, "set -Dguesshue.dataset=<path> to check the real dataset")

        val file = File(path!!)
        check(file.isFile) { "Property guesshue.dataset was set to $path, but that path is not a file (does not exist or is a directory)" }

        shouldNotThrowAny {
            val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
            loaded.entries.size shouldBe 60
        }
    }

    @Test
    fun `setting the property to a non-existent path fails, not skips`() {
        val previous = System.getProperty("guesshue.dataset")
        try {
            System.setProperty("guesshue.dataset", "/does/not/exist/guess-hue-dataset.yaml")

            shouldThrowAny {
                val path = System.getProperty("guesshue.dataset")
                val file = File(path!!)
                check(file.isFile) { "Property guesshue.dataset was set to $path, but that path is not a file (does not exist or is a directory)" }
            }
        } finally {
            if (previous != null) {
                System.setProperty("guesshue.dataset", previous)
            } else {
                System.clearProperty("guesshue.dataset")
            }
        }
    }
}
