package org.unividuell.countdown.core.spotobject.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder
import org.springframework.boot.http.client.HttpClientSettings
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.http.client.ClientHttpRequestFactory
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.spotobject.SpotObjectTerms
import java.time.Duration

@Configuration
@EnableConfigurationProperties(SpotObjectProperties::class)
class SpotObjectConfiguration {

    private val logger = KotlinLogging.logger {}

    @Bean
    fun spotObjectTermsLoader(properties: SpotObjectProperties) = SpotObjectTermsLoader(properties)

    /**
     * Short timeouts on purpose: this client is called from inside a judgement, and a stalled
     * connection there would hold up somebody's submission. Three seconds, then no flag.
     */
    @Bean
    fun googleMapsRequestFactory(): ClientHttpRequestFactory {
        val settings = HttpClientSettings.defaults()
            .withConnectTimeout(Duration.ofSeconds(3))
            .withReadTimeout(Duration.ofSeconds(3))
        return ClientHttpRequestFactoryBuilder.detect().build(settings)
    }

    @Bean
    fun googleMapsRestClient(
        builder: RestClient.Builder,
        @Qualifier("googleMapsRequestFactory") requestFactory: ClientHttpRequestFactory,
    ): RestClient = builder.baseUrl("https://maps.googleapis.com").requestFactory(requestFactory).build()

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
