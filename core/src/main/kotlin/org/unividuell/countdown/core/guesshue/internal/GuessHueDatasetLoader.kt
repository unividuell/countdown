package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry
import java.io.File

/** What was loaded, and from where — [isSample] decides the fail-fast in deployed environments. */
data class LoadedGuessHueDataset(
    val entries: List<GuessHueEntry>,
    val origin: String,
    val isSample: Boolean,
)

/**
 * Reads either the mounted file or the sample from the classpath. Nothing here knows about SOPS:
 * the deployment decrypts, the application just reads plain YAML from a path. That keeps key
 * management entirely outside the application code, and CI never needs a key.
 */
class GuessHueDatasetLoader(private val properties: GuessHueDatasetProperties) {

    fun load(): LoadedGuessHueDataset {
        val path = properties.datasetPath.trim()
        return if (path.isEmpty()) sample() else fromFile(path)
    }

    private fun fromFile(path: String): LoadedGuessHueDataset {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            throw GuessHueDatasetException(
                "app.guess-hue.dataset-path points at '$path', which is not a readable file",
            )
        }
        val entries = file.inputStream().use { GuessHueDatasetYamlReader.read(it, path) }
        GuessHueDatasetValidator.validateStructure(entries, path)
        GuessHueDatasetValidator.validateCompleteness(entries, path)
        return LoadedGuessHueDataset(entries, origin = path, isSample = false)
    }

    private fun sample(): LoadedGuessHueDataset {
        val stream = javaClass.getResourceAsStream(SAMPLE_RESOURCE)
            ?: throw GuessHueDatasetException("the bundled $SAMPLE_RESOURCE is missing from the classpath")
        val entries = stream.use { GuessHueDatasetYamlReader.read(it, SAMPLE_RESOURCE) }
        // Deliberately without validateCompleteness: the sample has six entries and should have them.
        GuessHueDatasetValidator.validateStructure(entries, SAMPLE_RESOURCE)
        return LoadedGuessHueDataset(entries, origin = SAMPLE_RESOURCE, isSample = true)
    }

    companion object {
        const val SAMPLE_RESOURCE = "/guess-hue-dataset.sample.yaml"
    }
}
