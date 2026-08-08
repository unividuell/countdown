package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream

/**
 * SnakeYAML statt Jackson: `org.yaml:snakeyaml` liegt über den Spring-Boot-Starter ohnehin im
 * Compile-Classpath (Boot parst `application.yaml` damit), ein `jackson-dataformat-yaml` wäre eine
 * neue Dependency für drei Felder.
 *
 * Jede Meldung nennt [origin] und die Position, weil der Leser im Regelfall gegen eine Datei läuft,
 * die der Fehlersuchende nicht offen hat — sie liegt entschlüsselt auf einem Server.
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
