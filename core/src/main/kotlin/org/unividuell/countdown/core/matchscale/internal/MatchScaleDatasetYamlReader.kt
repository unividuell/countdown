package org.unividuell.countdown.core.matchscale.internal

import org.unividuell.countdown.core.matchscale.MatchScaleCategory
import org.unividuell.countdown.core.matchscale.MatchScaleEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream
import kotlin.math.abs
import kotlin.math.max

/**
 * Checks what is mechanical only: the shape, blankness, finiteness and duplicates. Whether a
 * silhouette looks right is looked at on the review page, never asserted here.
 *
 * Every message names [origin] (and the entry), because the file sits decrypted on a server, not
 * open on the debugger's machine.
 */
object MatchScaleDatasetYamlReader {

    private val KEY = Regex("[a-z0-9-]+")
    private const val NORMALISED_SIDE = 1000.0
    private const val SIDE_TOLERANCE = 1e-9

    fun read(input: InputStream, origin: String): MatchScaleCategory {
        val root = Yaml().load<Any?>(input) as? Map<*, *>
            ?: throw MatchScaleDatasetException("$origin: expected a mapping at the top level")

        val key = (root["category"] as? String)?.trim().orEmpty()
        if (!KEY.matches(key)) {
            throw MatchScaleDatasetException("$origin: category key '$key' must match [a-z0-9-]+")
        }

        val displayName = (root["displayName"] as? String)?.trim().orEmpty()
        if (displayName.isEmpty()) throw MatchScaleDatasetException("$origin: displayName is blank")

        val categoryAttribution = (root["attribution"] as? String)?.trim()?.ifEmpty { null }

        val raw = root["entries"] as? List<*>
        if (raw.isNullOrEmpty()) throw MatchScaleDatasetException("$origin: entries is missing or empty")

        val entries = raw.mapIndexed { index, item ->
            entry(item = item, index = index, origin = origin, categoryAttribution = categoryAttribution)
        }

        val duplicate = entries.groupingBy { it.name }.eachCount().entries.firstOrNull { it.value > 1 }
        if (duplicate != null) {
            throw MatchScaleDatasetException("$origin: duplicate entry name '${duplicate.key}'")
        }

        return MatchScaleCategory(key = key, displayName = displayName, entries = entries)
    }

    private fun entry(item: Any?, index: Int, origin: String, categoryAttribution: String?): MatchScaleEntry {
        val map = item as? Map<*, *>
            ?: throw MatchScaleDatasetException("$origin entry #$index: expected a mapping")

        val name = (map["name"] as? String)?.trim().orEmpty()
        val label = if (name.isEmpty()) "$origin entry #$index" else "$origin entry '$name'"
        if (name.isEmpty()) throw MatchScaleDatasetException("$label: name is blank")

        val path = (map["path"] as? String)?.trim().orEmpty()
        if (path.isEmpty()) throw MatchScaleDatasetException("$label: path is blank")

        val width = positive(map = map, field = "width", label = label)
        val height = positive(map = map, field = "height", label = label)
        val metresPerUnit = positive(map = map, field = "metresPerUnit", label = label)

        if (abs(max(width, height) - NORMALISED_SIDE) > SIDE_TOLERANCE) {
            throw MatchScaleDatasetException(
                "$label: the longer side must be 1000, was max(width=$width, height=$height)",
            )
        }

        val attribution = (map["attribution"] as? String)?.trim()?.ifEmpty { null } ?: categoryAttribution

        return MatchScaleEntry(
            name = name,
            path = path,
            width = width,
            height = height,
            metresPerUnit = metresPerUnit,
            attribution = attribution,
        )
    }

    private fun positive(map: Map<*, *>, field: String, label: String): Double {
        val value = (map[field] as? Number)?.toDouble()
        if (value == null || !value.isFinite() || value <= 0.0) {
            throw MatchScaleDatasetException("$label: $field must be a finite number > 0, was ${map[field]}")
        }
        return value
    }
}
