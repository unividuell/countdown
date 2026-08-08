package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetConfiguration
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties

class GuessHueDatasetFailFastTest {

    private val configuration = GuessHueDatasetConfiguration()
    private val samplingLoader = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = ""))

    private fun environment(vararg profiles: String) =
        MockEnvironment().apply { setActiveProfiles(*profiles) }

    @Test
    fun `refuses to start on the sample under production`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            configuration.guessHueDataset(samplingLoader, environment("production"))
        }

        thrown.message!! shouldContain "production"
        thrown.message!! shouldContain "GUESS_HUE_DATASET_PATH"
    }

    @Test
    fun `refuses to start on the sample under staging`() {
        shouldThrow<GuessHueDatasetException> {
            configuration.guessHueDataset(samplingLoader, environment("staging"))
        }
    }

    @Test
    fun `allows the sample when no deployed profile is active`() {
        shouldNotThrowAny {
            val dataset = configuration.guessHueDataset(samplingLoader, environment())
            dataset.entries.size shouldBe 6
        }
    }
}
