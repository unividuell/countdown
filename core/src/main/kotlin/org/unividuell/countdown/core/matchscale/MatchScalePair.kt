package org.unividuell.countdown.core.matchscale

/** Two silhouettes of one category. [factor] is how many times larger B is than A in reality. */
data class MatchScalePair(
    val category: MatchScaleCategory,
    val a: MatchScaleEntry,
    val b: MatchScaleEntry,
) {
    val factor: Double = b.metresPerUnit / a.metresPerUnit
}
