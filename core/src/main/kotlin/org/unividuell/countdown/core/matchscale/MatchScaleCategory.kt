package org.unividuell.countdown.core.matchscale

/**
 * One file of the dataset: a pool of silhouettes that are compared with each other. [legend] says
 * how its silhouettes were drawn (a map projection, say): one footnote at both names.
 */
data class MatchScaleCategory(
    val key: String,
    val displayName: String,
    val entries: List<MatchScaleEntry>,
    val legend: String? = null,
)
