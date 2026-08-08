package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry
import java.io.File

/** Was geladen wurde, und woher — [isSample] entscheidet über den Fail-Fast im Betrieb. */
data class LoadedGuessHueDataset(
    val entries: List<GuessHueEntry>,
    val origin: String,
    val isSample: Boolean,
)

/**
 * Liest entweder die gemountete Datei oder das Beispiel aus dem Classpath. Nichts hier weiß von
 * SOPS: das Deployment entschlüsselt, die Anwendung liest schlichtes YAML von einem Pfad. Damit
 * bleibt Schlüsselverwaltung vollständig außerhalb des Anwendungscodes und die CI braucht nie
 * einen Schlüssel.
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
        // Bewusst ohne validateCompleteness: das Beispiel hat sechs Einträge und soll sie haben.
        GuessHueDatasetValidator.validateStructure(entries, SAMPLE_RESOURCE)
        return LoadedGuessHueDataset(entries, origin = SAMPLE_RESOURCE, isSample = true)
    }

    companion object {
        const val SAMPLE_RESOURCE = "/guess-hue-dataset.sample.yaml"
    }
}
