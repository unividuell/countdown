package org.unividuell.countdown.core.spotobject

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.unividuell.countdown.core.spotobject.internal.SpotObjectConfiguration
import org.unividuell.countdown.core.spotobject.internal.SpotObjectException
import org.unividuell.countdown.core.spotobject.internal.SpotObjectProperties
import org.unividuell.countdown.core.spotobject.internal.SpotObjectTermsLoader

class SpotObjectTermsFailFastTest {

    private val configuration = SpotObjectConfiguration()
    private val samplingLoader = SpotObjectTermsLoader(SpotObjectProperties(termsPath = ""))

    private fun environment(vararg profiles: String) =
        MockEnvironment().apply { setActiveProfiles(*profiles) }

    @Test
    fun `refuses to start on the sample under production`() {
        val thrown = shouldThrow<SpotObjectException> {
            configuration.spotObjectTerms(samplingLoader, environment("production"))
        }

        thrown.message!! shouldContain "production"
        thrown.message!! shouldContain "SPOT_OBJECT_TERMS_PATH"
    }

    @Test
    fun `refuses to start on the sample under staging`() {
        shouldThrow<SpotObjectException> {
            configuration.spotObjectTerms(samplingLoader, environment("staging"))
        }
    }

    @Test
    fun `allows the sample when no deployed profile is active`() {
        shouldNotThrowAny {
            val terms = configuration.spotObjectTerms(samplingLoader, environment())
            terms.terms.size shouldBe 12
        }
    }
}
