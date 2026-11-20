package org.unividuell.countdown.core.matchscale

/**
 * The real-world size an entry's [MatchScaleEntry.metresPerUnit] was computed from, kept so it can be
 * shown and researched again: [axis] of the drawn silhouette is [metres] long, per [source].
 */
data class MatchScaleMeasure(
    val axis: MatchScaleAxis,
    val metres: Double,
    val source: String,
)

/** The side of the silhouette that was measured. [key] is its spelling in the dataset and on the wire. */
enum class MatchScaleAxis(val key: String) {
    /** Bounding-box width: an animal's length, seen from the side. */
    LENGTH("length"),

    /** Bounding-box height. */
    HEIGHT("height"),
    ;

    companion object {
        fun ofKey(key: String): MatchScaleAxis? = entries.firstOrNull { it.key == key }
    }
}
