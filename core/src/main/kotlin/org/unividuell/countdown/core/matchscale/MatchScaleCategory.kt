package org.unividuell.countdown.core.matchscale

/**
 * One file of the dataset: a pool of silhouettes that are compared with each other. [legend] says,
 * under the category's heading, how its silhouettes were drawn (a map projection, say).
 */
data class MatchScaleCategory(
    val key: String,
    val displayName: String,
    val entries: List<MatchScaleEntry>,
    val legend: String? = null,
)
