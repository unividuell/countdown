package org.unividuell.countdown.core.songsnippet

object SongSnippetStages {
    /** The ladder. Prefixes of one and the same excerpt — stage n is contained in stage n+1. */
    val DURATIONS_SECONDS: List<Double> = listOf(0.1, 0.5, 2.0, 8.0, 15.0)

    /** Skipped before cutting: label-side fade-ins would make the 0.1s stage effectively silence. */
    const val FADE_SKIP_SECONDS = 0.5

    /** Mirrors game's SOLUTION_ASSET_KEY (= 99) without importing it — the arrow points game -> songsnippet. */
    const val SOLUTION_KEY = 99
}
