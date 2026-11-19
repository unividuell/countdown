package org.unividuell.countdown.core.matchscale

/** One file of the dataset: a pool of silhouettes that are compared with each other. */
data class MatchScaleCategory(
    val key: String,
    val displayName: String,
    val entries: List<MatchScaleEntry>,
)
