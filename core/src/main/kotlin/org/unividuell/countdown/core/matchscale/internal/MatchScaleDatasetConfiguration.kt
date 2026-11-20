package org.unividuell.countdown.core.matchscale.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.unividuell.countdown.core.matchscale.MatchScaleDataset

@Configuration
@EnableConfigurationProperties(MatchScaleDatasetProperties::class)
class MatchScaleDatasetConfiguration {

    private val logger = KotlinLogging.logger {}

    @Bean
    fun matchScaleDatasetLoader(properties: MatchScaleDatasetProperties) = MatchScaleDatasetLoader(properties)

    /**
     * Loads at startup, not on the first move: a dataset error should stop the deployment, not a
     * round that's already in progress.
     */
    @Bean
    fun matchScaleDataset(loader: MatchScaleDatasetLoader, environment: Environment): MatchScaleDataset {
        val loaded = loader.load()
        val deployedProfiles = environment.activeProfiles.filter { it in DEPLOYED_PROFILES }

        if (loaded.isSample && deployedProfiles.isNotEmpty()) {
            throw MatchScaleDatasetException(
                "the bundled sample dataset was loaded under profile(s) ${deployedProfiles.joinToString()} — " +
                    "set MATCH_SCALE_DATASET_DIR to the directory with the decrypted production categories. " +
                    "Refusing to start: a game running on placeholder content looks healthy and is not.",
            )
        }

        if (loaded.categories.isEmpty()) {
            logger.warn { "Augenmaß has no active category in ${loaded.origin} — the game is unavailable" }
        } else if (loaded.isSample) {
            logger.warn { "Augenmaß is running on the bundled sample dataset (${loaded.origin}) — local development only" }
        } else {
            logger.info {
                "Augenmaß loaded ${loaded.categories.size} categories (${loaded.categories.joinToString { it.key }}) from ${loaded.origin}"
            }
        }

        return MatchScaleDataset(loaded.categories)
    }

    companion object {
        /** The profiles under which real players play. Everything else is local development. */
        val DEPLOYED_PROFILES = setOf("production", "staging")
    }
}
