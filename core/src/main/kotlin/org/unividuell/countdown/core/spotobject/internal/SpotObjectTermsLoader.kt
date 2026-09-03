package org.unividuell.countdown.core.spotobject.internal

import java.io.File

/** What was loaded, and from where — [isSample] decides the fail-fast in deployed environments. */
data class LoadedSpotObjectTerms(
    val terms: List<String>,
    val origin: String,
    val isSample: Boolean,
)

/**
 * Reads either the mounted file or the sample from the classpath. Nothing here knows about SOPS:
 * the deployment decrypts, the application just reads plain YAML from a path.
 */
class SpotObjectTermsLoader(private val properties: SpotObjectProperties) {

    fun load(): LoadedSpotObjectTerms {
        val path = properties.termsPath.trim()
        return if (path.isEmpty()) sample() else fromFile(path)
    }

    private fun fromFile(path: String): LoadedSpotObjectTerms {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            throw SpotObjectException(
                "app.spot-object.terms-path points at '$path', which is not a readable file",
            )
        }
        val terms = file.inputStream().use { SpotObjectTermsYamlReader.read(it, path) }
        return LoadedSpotObjectTerms(terms, origin = path, isSample = false)
    }

    private fun sample(): LoadedSpotObjectTerms {
        val stream = javaClass.getResourceAsStream(SAMPLE_RESOURCE)
            ?: throw SpotObjectException("the bundled $SAMPLE_RESOURCE is missing from the classpath")
        val terms = stream.use { SpotObjectTermsYamlReader.read(it, SAMPLE_RESOURCE) }
        return LoadedSpotObjectTerms(terms, origin = SAMPLE_RESOURCE, isSample = true)
    }

    companion object {
        const val SAMPLE_RESOURCE = "/spot-object-terms.sample.yaml"
    }
}
