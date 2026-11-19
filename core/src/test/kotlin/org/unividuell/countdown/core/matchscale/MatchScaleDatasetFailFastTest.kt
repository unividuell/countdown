package org.unividuell.countdown.core.matchscale

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetConfiguration
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetException
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetLoader
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetProperties

class MatchScaleDatasetFailFastTest {

    private val configuration = MatchScaleDatasetConfiguration()
    private val samplingLoader = MatchScaleDatasetLoader(MatchScaleDatasetProperties(datasetDir = ""))

    private fun environment(vararg profiles: String) =
        MockEnvironment().apply { setActiveProfiles(*profiles) }

    @Test
    fun `refuses to start on the sample under production`() {
        val thrown = shouldThrow<MatchScaleDatasetException> {
            configuration.matchScaleDataset(samplingLoader, environment("production"))
        }

        thrown.message!! shouldContain "production"
        thrown.message!! shouldContain "MATCH_SCALE_DATASET_DIR"
    }

    @Test
    fun `refuses to start on the sample under staging`() {
        shouldThrow<MatchScaleDatasetException> {
            configuration.matchScaleDataset(samplingLoader, environment("staging"))
        }
    }

    @Test
    fun `allows the sample when no deployed profile is active`() {
        configuration.matchScaleDataset(samplingLoader, environment()).categories.size shouldBe 2
    }
}
