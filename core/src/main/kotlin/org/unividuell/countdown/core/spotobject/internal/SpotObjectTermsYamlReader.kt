package org.unividuell.countdown.core.spotobject.internal

import org.yaml.snakeyaml.Yaml
import java.io.InputStream

/**
 * SnakeYAML rather than Jackson: `org.yaml:snakeyaml` is already on the compile classpath via the
 * Spring Boot starter, so a `jackson-dataformat-yaml` would be a new dependency for one list.
 *
 * Checks what is mechanical only: the shape, blankness, and duplicates. Whether a term is
 * worldwide and recognisable is looked at, never asserted here.
 *
 * Every message names [origin], because whoever debugs this is not looking at the file — it sits
 * decrypted on a server, not open on their machine.
 */
object SpotObjectTermsYamlReader {

    fun read(source: InputStream, origin: String): List<String> {
        val root = Yaml().load<Any?>(source)
        val terms = (root as? Map<*, *>)?.get("terms")
            ?: throw SpotObjectException("$origin: expected a top-level 'terms' list")
        if (terms !is List<*>) {
            throw SpotObjectException("$origin: 'terms' must be a list, was ${terms::class.simpleName}")
        }
        if (terms.isEmpty()) throw SpotObjectException("$origin: 'terms' is empty")

        val trimmed = terms.mapIndexed { index, raw -> term(raw = raw, origin = origin, index = index) }
        val duplicate = trimmed.groupingBy { it }.eachCount().entries.firstOrNull { it.value > 1 }
        if (duplicate != null) {
            throw SpotObjectException("$origin: duplicate term '${duplicate.key}'")
        }
        return trimmed
    }

    private fun term(raw: Any?, origin: String, index: Int): String {
        val trimmed = (raw as? String)?.trim()
        if (trimmed.isNullOrEmpty()) {
            throw SpotObjectException("$origin term #$index: expected a non-blank string")
        }
        return trimmed
    }
}
