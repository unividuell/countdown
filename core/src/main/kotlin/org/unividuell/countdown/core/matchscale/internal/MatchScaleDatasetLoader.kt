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

        val files = selectFiles(directory)
        val categories = files.map { file ->
            file.inputStream().use { MatchScaleDatasetYamlReader.read(it, file.path) }
        }

        return LoadedMatchScaleDataset(categories = playable(categories), origin = path, isSample = false)
    }

    /**
     * The category files to load. A `categories.txt` beside them is the on/off switch (the same list
     * update.sh deploys): only the keys on a line are loaded.
     *
     *     categories.txt      countries      -> countries.yaml loaded
     *                         # animals      -> animals.yaml ignored
     *
     * Without the list every file counts, which keeps the sample and plain directories working.
     */
    private fun selectFiles(directory: File): List<File> {
        val files = directory.listFiles { file -> file.isFile && file.name.endsWith(".yaml") }
            .orEmpty()
            .sortedBy { it.name }
        val list = File(directory, LIST_FILE)
        if (!list.isFile) return files

        val keys = parseKeys(list)
        val byKey = files.associateBy { it.name.removeSuffix(".yaml") }

        val missing = keys.firstOrNull { it !in byKey }
        if (missing != null) {
            throw MatchScaleDatasetException("$LIST_FILE lists '$missing', but ${directory.path} has no $missing.yaml")
        }

        val ignored = byKey.keys - keys.toSet()
        if (ignored.isNotEmpty()) {
            logger.info { "Augenmaß leaves out switched-off categories: ${ignored.sorted().joinToString()}" }
        }

        return keys.map { byKey.getValue(it) }
    }

    private fun parseKeys(list: File): List<String> =
        list.readLines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }.onEach { key ->
            if (!KEY_PATTERN.matches(key)) {
                throw MatchScaleDatasetException("$LIST_FILE holds the invalid category key '$key', expected [a-z0-9-]+")
            }
        }.distinct()

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

        if (categories.isNotEmpty() && kept.isEmpty()) throw MatchScaleDatasetException("no playable category left — nothing to draw a round from")

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
        const val LIST_FILE = "categories.txt"
        private val KEY_PATTERN = Regex("[a-z0-9-]+")
        const val SAMPLE_DIR = "/games/match-scale/sample"
        private val SAMPLE_FILES = listOf("shapes.yaml", "blocks.yaml")
        private const val MIN_PAIRS = 2
    }
}
