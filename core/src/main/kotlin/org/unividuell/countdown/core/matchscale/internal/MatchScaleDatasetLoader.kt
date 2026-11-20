package org.unividuell.countdown.core.matchscale.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.unividuell.countdown.core.matchscale.MatchScaleCategory
import org.unividuell.countdown.core.matchscale.MatchScaleDataset.Companion.MAX_FACTOR
import org.unividuell.countdown.core.matchscale.MatchScaleDataset.Companion.withinFactor
import java.io.File

/** What was loaded, and from where — [isSample] decides the fail-fast in deployed environments. */
data class LoadedMatchScaleDataset(
    val categories: List<MatchScaleCategory>,
    val origin: String,
    val isSample: Boolean,
)

/**
 * Reads either the mounted directory (one file per category) or the sample from the classpath.
 * Nothing here knows about SOPS: the deployment decrypts, the application reads plain YAML.
 */
class MatchScaleDatasetLoader(private val properties: MatchScaleDatasetProperties) {

    private val logger = KotlinLogging.logger {}

    fun load(): LoadedMatchScaleDataset {
        val dir = properties.datasetDir.trim()
        return if (dir.isEmpty()) sample() else fromDirectory(dir)
    }

    private fun fromDirectory(path: String): LoadedMatchScaleDataset {
        val directory = File(path)
        if (!directory.isDirectory || !directory.canRead()) {
            throw MatchScaleDatasetException(
                "app.match-scale.dataset-dir points at '$path', which is not a readable directory",
            )
        }

        val files = directory.listFiles { file -> file.isFile && file.name.endsWith(".yaml") }
            .orEmpty()
            .sortedBy { it.name }
        val categories = files.map { file ->
            file.inputStream().use { MatchScaleDatasetYamlReader.read(it, file.path) }
        }

        return LoadedMatchScaleDataset(categories = playable(categories), origin = path, isSample = false)
    }

    private fun sample(): LoadedMatchScaleDataset {
        val categories = SAMPLE_FILES.map { name ->
            val resource = "$SAMPLE_DIR/$name"
            val stream = javaClass.getResourceAsStream(resource)
                ?: throw MatchScaleDatasetException("the bundled $resource is missing from the classpath")
            stream.use { MatchScaleDatasetYamlReader.read(it, resource) }
        }

        return LoadedMatchScaleDataset(categories = playable(categories), origin = SAMPLE_DIR, isSample = true)
    }

    /**
     * Drops categories that cannot make two distinct rounds, so a draw never has to give up.
     * A pair is two distinct entries whose real sizes differ by at most [MAX_FACTOR].
     */
    private fun playable(categories: List<MatchScaleCategory>): List<MatchScaleCategory> {
        val duplicate = categories.groupingBy { it.key }.eachCount().entries.firstOrNull { it.value > 1 }
        if (duplicate != null) {
            throw MatchScaleDatasetException("category key '${duplicate.key}' is defined by more than one file")
        }

        val kept = categories.filter { category ->
            val pairs = pairCount(category)
            if (pairs < MIN_PAIRS) {
                logger.warn { "Augenmaß leaves out category '${category.key}': $pairs pair(s) within factor $MAX_FACTOR, need $MIN_PAIRS" }
            }
            pairs >= MIN_PAIRS
        }

        if (kept.isEmpty()) throw MatchScaleDatasetException("no playable category left — nothing to draw a round from")

        return kept
    }

    private fun pairCount(category: MatchScaleCategory): Int {
        val entries = category.entries
        var pairs = 0
        for (i in entries.indices) {
            for (j in i + 1 until entries.size) {
                if (withinFactor(entries[i], entries[j])) pairs++
            }
        }
        return pairs
    }

    companion object {
        const val SAMPLE_DIR = "/match-scale-sample"
        private val SAMPLE_FILES = listOf("shapes.yaml", "blocks.yaml")
        private const val MIN_PAIRS = 2
    }
}
