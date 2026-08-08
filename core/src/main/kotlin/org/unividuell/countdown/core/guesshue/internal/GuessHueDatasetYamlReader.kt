package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream

/**
 * SnakeYAML rather than Jackson: `org.yaml:snakeyaml` is already on the compile classpath via the
 * Spring Boot starter (Boot uses it to parse `application.yaml`), so a `jackson-dataformat-yaml`
 * would be a whole new dependency for three fields.
 *
 * Every message names [origin] and the position, because whoever is debugging this typically isn't
 * looking at the file that failed — it sits decrypted on a server, not open on their machine.
 */
object GuessHueDatasetYamlReader {

    fun read(source: InputStream, origin: String): List<GuessHueEntry> {
        val root = Yaml().load<Any?>(source)
        val entries = (root as? Map<*, *>)?.get("entries")
            ?: throw GuessHueDatasetException("$origin: expected a top-level 'entries' list")
        if (entries !is List<*>) {
            throw GuessHueDatasetException("$origin: 'entries' must be a list, was ${entries::class.simpleName}")
        }
        if (entries.isEmpty()) throw GuessHueDatasetException("$origin: 'entries' is empty")
        return entries.mapIndexed { index, raw -> entry(raw, origin, index) }
    }

    private fun entry(raw: Any?, origin: String, index: Int): GuessHueEntry {
        val where = "$origin entry #$index"
        val map = raw as? Map<*, *>
            ?: throw GuessHueDatasetException("$where: expected a mapping with hue, difficulty and description")

        val hue = map["hue"] as? Int
            ?: throw GuessHueDatasetException("$where: 'hue' is missing or not an integer")

        val rawDifficulty = map["difficulty"] as? String
            ?: throw GuessHueDatasetException("$where: 'difficulty' is missing or not a string")
        val difficulty = GuessHueDifficulty.entries.firstOrNull { it.name.equals(rawDifficulty, ignoreCase = true) }
            ?: throw GuessHueDatasetException(
                "$where: unknown difficulty '$rawDifficulty', expected one of " +
                    GuessHueDifficulty.entries.joinToString { it.name.lowercase() },
            )

        val description = (map["description"] as? String)?.trim()
        if (description.isNullOrEmpty()) {
            throw GuessHueDatasetException("$where: 'description' is missing or blank")
        }

        return GuessHueEntry(hue = hue, difficulty = difficulty, description = description)
    }
}
