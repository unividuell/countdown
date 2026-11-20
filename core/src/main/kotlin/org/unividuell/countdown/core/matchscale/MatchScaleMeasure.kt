package org.unividuell.countdown.core.matchscale

/**
 * The real-world size an entry's [MatchScaleEntry.metresPerUnit] was computed from, kept so it can be
 * shown and researched again: [axis] of the drawn silhouette is [metres] long, per [source].
 * [span] is where along that axis the measure sits; absent, it spans the whole bounding box.
 * [kind] names what was measured, for the reveal; absent, the reveal says just the axis.
 * [subject] is the concrete thing measured where the entry's name is generic ("Alpha" → "Alpha Mk II
 * of 1984"): named in the reveal only, as a model name may give the size away.
 */
data class MatchScaleMeasure(
    val axis: MatchScaleAxis,
    val kind: MatchScaleMeasureKind? = null,
    val metres: Double,
    val source: String,
    val span: MatchScaleSpan? = null,
    val subject: String? = null,
)

/**
 * The stretch of the normalised path (0…1000, y down) the measure covers, e.g. nose tip to tail base
 * at x 120…870. Stays on the server: the client shows the measure, not where it was taken.
 */
data class MatchScaleSpan(val from: Double, val to: Double)

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

/** What a measure measured. Each fits one [axis]; [key] is its spelling in the dataset and on the wire. */
enum class MatchScaleMeasureKind(val key: String, val axis: MatchScaleAxis) {
    /** Nose tip to tail base. */
    HEAD_BODY("head-body", MatchScaleAxis.LENGTH),

    /** Everything, tail included. */
    TOTAL_LENGTH("total-length", MatchScaleAxis.LENGTH),

    /** Ground to withers. */
    SHOULDER("shoulder", MatchScaleAxis.HEIGHT),

    /** Ground to the highest point. */
    TOTAL_HEIGHT("total-height", MatchScaleAxis.HEIGHT),

    /** Across a wheel, top to bottom. */
    DIAMETER("diameter", MatchScaleAxis.HEIGHT),
    ;

    companion object {
        fun ofKey(key: String): MatchScaleMeasureKind? = entries.firstOrNull { it.key == key }
    }
}
