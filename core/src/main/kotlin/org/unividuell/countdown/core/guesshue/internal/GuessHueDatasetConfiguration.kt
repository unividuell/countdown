package org.unividuell.countdown.core.guesshue.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.unividuell.countdown.core.guesshue.GuessHueDataset

@Configuration
@EnableConfigurationProperties(GuessHueDatasetProperties::class)
class GuessHueDatasetConfiguration {

    private val logger = KotlinLogging.logger {}

    @Bean
    fun guessHueDatasetLoader(properties: GuessHueDatasetProperties) = GuessHueDatasetLoader(properties)

    /**
     * Loads at startup, not on the first move: a dataset error should stop the deployment, not a
     * round that's already in progress.
     */
    @Bean
    fun guessHueDataset(loader: GuessHueDatasetLoader, environment: Environment): GuessHueDataset {
        val loaded = loader.load()
        val deployedProfiles = environment.activeProfiles.filter { it in DEPLOYED_PROFILES }

        if (loaded.isSample && deployedProfiles.isNotEmpty()) {
            throw GuessHueDatasetException(
                "the bundled sample dataset was loaded under profile(s) ${deployedProfiles.joinToString()} — " +
                    "set GUESS_HUE_DATASET_PATH to the decrypted production dataset. Refusing to start: " +
                    "a game running on placeholder content looks healthy and is not.",
            )
        }

        if (loaded.isSample) {
            logger.warn { "Guess Hue is running on the bundled sample dataset (${loaded.origin}) — local development only" }
        } else {
            logger.info { "Guess Hue loaded ${loaded.entries.size} entries from ${loaded.origin}" }
        }

        return GuessHueDataset(loaded.entries)
    }

    companion object {
        /** The profiles under which real players play. Everything else is local development. */
        val DEPLOYED_PROFILES = setOf("production", "staging")
    }
}
