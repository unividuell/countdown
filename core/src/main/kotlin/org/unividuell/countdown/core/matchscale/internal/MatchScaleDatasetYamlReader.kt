package org.unividuell.countdown.core.matchscale.internal

import org.unividuell.countdown.core.matchscale.MatchScaleAxis
import org.unividuell.countdown.core.matchscale.MatchScaleCategory
import org.unividuell.countdown.core.matchscale.MatchScaleEntry
import org.unividuell.countdown.core.matchscale.MatchScaleMeasure
import org.unividuell.countdown.core.matchscale.MatchScaleMeasureKind
import org.unividuell.countdown.core.matchscale.MatchScaleSpan
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
        val legend = (root["legend"] as? String)?.trim()?.ifEmpty { null }

        val raw = root["entries"] as? List<*>
        if (raw.isNullOrEmpty()) throw MatchScaleDatasetException("$origin: entries is missing or empty")

        val entries = raw.mapIndexed { index, item ->
            entry(item = item, index = index, origin = origin, categoryAttribution = categoryAttribution)
        }

        val duplicate = entries.groupingBy { it.name }.eachCount().entries.firstOrNull { it.value > 1 }
        if (duplicate != null) {
            throw MatchScaleDatasetException("$origin: duplicate entry name '${duplicate.key}'")
        }

        return MatchScaleCategory(key = key, displayName = displayName, entries = entries, legend = legend)
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
            measure = map["measure"]?.let { measure(item = it, label = label) },
        )
    }

    /**
     * Optional: `{ axis: length|height, kind: head-body, metres: 2.3, source: "https://…", span: [120, 870],
     * subject: "…" }`. Absent → null; present → complete, except `span`, `kind` and `subject`, which are
     * optional themselves.
     */
    private fun measure(item: Any, label: String): MatchScaleMeasure {
        val map = item as? Map<*, *>
            ?: throw MatchScaleDatasetException("$label: measure must be a mapping")

        val axisKey = (map["axis"] as? String)?.trim().orEmpty()
        val axis = MatchScaleAxis.ofKey(axisKey)
            ?: throw MatchScaleDatasetException("$label: measure.axis must be length or height, was '$axisKey'")

        val kind = map["kind"]?.let { kind(item = it, axis = axis, label = label) }

        val metres = positive(map = map, field = "metres", label = "$label, measure")

        val source = (map["source"] as? String)?.trim().orEmpty()
        if (source.isEmpty()) throw MatchScaleDatasetException("$label: measure.source is blank")

        val subject = map["subject"]?.let {
            (it as? String)?.trim()?.ifEmpty { null }
                ?: throw MatchScaleDatasetException("$label: measure.subject must be a non-blank string")
        }

        return MatchScaleMeasure(
            axis = axis,
            kind = kind,
            metres = metres,
            source = source,
            span = map["span"]?.let { span(item = it, label = label) },
            subject = subject,
        )
    }

    /** One of [MatchScaleMeasureKind], and one that fits the measure's [axis]. */
    private fun kind(item: Any, axis: MatchScaleAxis, label: String): MatchScaleMeasureKind {
        val kind = (item as? String)?.trim()?.let { MatchScaleMeasureKind.ofKey(it) }
            ?: throw MatchScaleDatasetException("$label: measure.kind must be one of ${kinds()}, was '$item'")

        if (kind.axis != axis) {
            throw MatchScaleDatasetException("$label: measure.kind '${kind.key}' does not fit axis ${axis.key}")
        }
        return kind
    }

    private fun kinds() = MatchScaleMeasureKind.entries.joinToString { it.key }

    /** `[from, to]`: two finite numbers within the normalised side, from < to. */
    private fun span(item: Any, label: String): MatchScaleSpan {
        // Anything but two numbers becomes NaN, which fails every comparison below.
        val (from, to) = (item as? List<*>)
            ?.takeIf { it.size == 2 }
            ?.map { (it as? Number)?.toDouble() ?: Double.NaN }
            ?: listOf(Double.NaN, Double.NaN)

        if (!(from >= 0.0 && to <= NORMALISED_SIDE && from < to)) {
            throw MatchScaleDatasetException(
                "$label: measure.span must be [from, to] with 0 <= from < to <= 1000, was $item",
            )
        }
        return MatchScaleSpan(from = from, to = to)
    }

    private fun positive(map: Map<*, *>, field: String, label: String): Double {
        val value = (map[field] as? Number)?.toDouble()
        if (value == null || !value.isFinite() || value <= 0.0) {
            throw MatchScaleDatasetException("$label: $field must be a finite number > 0, was ${map[field]}")
        }
        return value
    }
}
