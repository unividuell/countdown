package org.unividuell.countdown.core.guesshue

/**
 * Author metadata, not a runtime switch. Nothing reads this field at game time — the difficulty
 * mix falls out of the data alone, because the seed draws uniformly across all entries. It exists
 * so the spec's two-sentence rule is checkable rather than a matter of taste.
 */
enum class GuessHueDifficulty { EASY, MEDIUM, HARD }

/**
 * An entry is a colour *family*, not a colour value: [hue] is the **nominal** angle the round
 * jitters around, and saturation and lightness aren't part of it at all — those are drawn fresh
 * per round.
 *
 * See `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`.
 */
data class GuessHueEntry(
    val hue: Int,
    val difficulty: GuessHueDifficulty,
    val description: String,
)
