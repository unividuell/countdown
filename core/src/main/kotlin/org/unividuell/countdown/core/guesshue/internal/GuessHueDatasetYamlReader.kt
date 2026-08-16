package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Date

/**
 * SnakeYAML rather than Jackson: `org.yaml:snakeyaml` is already on the compile classpath via the
 * Spring Boot starter (Boot uses it to parse `application.yaml`), so a `jackson-dataformat-yaml`
 * would be a whole new dependency for five fields.
 *
 * This is the dataset's only checking left. It parses and it bounds values; it does not judge
 * prose. The validator that used to do the latter was deleted on 2026-08-16 — see the spec's
 * "Validierung" chapter for why.
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
            ?: throw GuessHueDatasetException(
                "$where: expected a mapping with hue, saturation, lightness, generatedAt and description",
            )

        val hue = map["hue"] as? Int
            ?: throw GuessHueDatasetException("$where: 'hue' is missing or not an integer")
        if (hue !in 0..359) {
            throw GuessHueDatasetException("$where: 'hue' must lie in 0..359, was $hue")
        }

        val description = (map["description"] as? String)?.trim()
        if (description.isNullOrEmpty()) {
            throw GuessHueDatasetException("$where: 'description' is missing or blank")
        }

        return GuessHueEntry(
            hue = hue,
            saturation = fraction(raw = map["saturation"], where = where, field = "saturation"),
            lightness = fraction(raw = map["lightness"], where = where, field = "lightness"),
            generatedAt = generatedAt(raw = map["generatedAt"], where = where),
            description = description,
        )
    }

    /** Read as a [Number], not as a Double: YAML resolves `0.5` to a Double but `0` and `1` to an
     *  Int, and both spellings turn up in a hand-written file. */
    private fun fraction(raw: Any?, where: String, field: String): Double {
        val value = (raw as? Number)?.toDouble()
            ?: throw GuessHueDatasetException("$where: '$field' is missing or not a number")
        if (value < 0.0 || value > 1.0) {
            throw GuessHueDatasetException("$where: '$field' must lie in 0.0..1.0, was $value")
        }
        return value
    }

    /**
     * SnakeYAML resolves an unquoted `2024-03-03` to a [Date] (YAML 1.1 timestamps) and a quoted one
     * to a String. Both spellings mean the same date to whoever edits the file by hand, so both are
     * accepted here — making the quoting a rule instead would be a rule nobody remembers, enforced
     * by an error message that reads like a type mismatch.
     */
    private fun generatedAt(raw: Any?, where: String): LocalDate = when (raw) {
        is Date -> raw.toInstant().atZone(ZoneOffset.UTC).toLocalDate()
        is String -> runCatching { LocalDate.parse(raw.trim()) }.getOrElse {
            throw GuessHueDatasetException("$where: 'generatedAt' is not a YYYY-MM-DD date, was '$raw'")
        }
        null -> throw GuessHueDatasetException("$where: 'generatedAt' is missing")
        else -> throw GuessHueDatasetException(
            "$where: 'generatedAt' is not a date, was ${raw::class.simpleName}",
        )
    }
}
