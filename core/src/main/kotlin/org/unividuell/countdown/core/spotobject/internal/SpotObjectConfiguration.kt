package org.unividuell.countdown.core.spotobject.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.unividuell.countdown.core.spotobject.SpotObjectTerms

@Configuration
@EnableConfigurationProperties(SpotObjectProperties::class)
class SpotObjectConfiguration {

    private val logger = KotlinLogging.logger {}

    @Bean
    fun spotObjectTermsLoader(properties: SpotObjectProperties) = SpotObjectTermsLoader(properties)

    /**
     * Loads at startup, not on the first move: a term-list error should stop the deployment, not a
     * round that's already in progress.
     */
    @Bean
    fun spotObjectTerms(loader: SpotObjectTermsLoader, environment: Environment): SpotObjectTerms {
        val loaded = loader.load()
        val deployedProfiles = environment.activeProfiles.filter { it in DEPLOYED_PROFILES }

        if (loaded.isSample && deployedProfiles.isNotEmpty()) {
            throw SpotObjectException(
                "the bundled sample term list was loaded under profile(s) ${deployedProfiles.joinToString()} — " +
                    "set SPOT_OBJECT_TERMS_PATH to the decrypted production term list. Refusing to start: " +
                    "a game running on placeholder content looks healthy and is not.",
            )
        }

        if (loaded.isSample) {
            logger.warn { "Weltanschauung is running on the bundled sample term list (${loaded.origin}) — local development only" }
        } else {
            logger.info { "Weltanschauung loaded ${loaded.terms.size} terms from ${loaded.origin}" }
        }

        return SpotObjectTerms(loaded.terms)
    }

    companion object {
        /** The profiles under which real players play. Everything else is local development. */
        val DEPLOYED_PROFILES = setOf("production", "staging")
    }
}
