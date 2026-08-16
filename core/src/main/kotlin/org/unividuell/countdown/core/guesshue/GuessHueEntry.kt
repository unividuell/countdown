package org.unividuell.countdown.core.guesshue

import java.time.LocalDate

/**
 * One curated colour, complete. [hue] is the **nominal** angle the round jitters around;
 * [saturation] and [lightness] are the entry's own and reach the round untouched.
 *
 * They belong to the entry rather than to the draw because the description talks about them: "a
 * dark emerald" is only true if the wheel shows one, and an object has a characteristic saturation
 * and lightness, not just a hue. Drawing them per round — which this dataset did until 2026-08-16 —
 * had the wheel contradict the text and cost the descriptions half their vocabulary.
 *
 * [generatedAt] is author statistics: which cohort an entry belongs to. It never leaves the server,
 * which the payload field-set test in `GuessHueGameTypeTest` is what enforces. Its only reader is
 * `GuessHueCohorts`, in the startup log.
 *
 * See `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`.
 */
data class GuessHueEntry(
    val hue: Int,
    val saturation: Double,
    val lightness: Double,
    val generatedAt: LocalDate,
    val description: String,
)
