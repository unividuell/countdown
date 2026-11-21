package org.unividuell.countdown.core.matchscale

/**
 * One silhouette. The path is normalised so the longer bounding-box side is 1000 units;
 * [metresPerUnit] turns those units into real metres, so two entries compare by that ratio.
 * [attribution] is already resolved: the entry's own, else its category's. [measure] is where
 * [metresPerUnit] came from, absent for generated categories.
 */
data class MatchScaleEntry(
    val name: String,
    val path: String,
    val width: Double,
    val height: Double,
    val metresPerUnit: Double,
    val attribution: String?,
    val measure: MatchScaleMeasure? = null,
)
