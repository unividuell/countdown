package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.countdown.Round
import java.time.Instant

/** Why this round carries no game. Distinguished so the UI can say something true. */
enum class NoGameReason {
    /** No active run, or the run has no target date yet — the countdown has not begun. */
    NOT_SCHEDULED,

    /** The round lies before the run's game window: a larger number than `games_from_round`. */
    BEFORE_WINDOW,

    /** The round lies after it: a smaller number than `games_until_round`. */
    AFTER_WINDOW,

    /** The window is open but the catalogue offers nothing. */
    NO_GAME_TYPE,
}

/**
 * Mirrors `countdown.internal.RoundDto` field for field, deliberately rather than reusing it: that
 * one is `internal` to the `countdown` module, and a shared DTO would tie two modules' wire formats
 * together. Four fields are cheaper than that coupling.
 */
data class RoundDto(val number: Int, val label: String, val start: Instant, val end: Instant)

data class GameDto(val id: String, val displayName: String)

/**
 * `round` is null when there is no grid at all (no run, no date). It is present with `game == null`
 * when the round exists but carries no game — the window, or an empty catalogue.
 *
 * Plan 3 adds the play state (`payload`, `solution`, `me`, `others`); this slice announces only.
 */
data class RoundResponse(
    val round: RoundDto?,
    val game: GameDto?,
    val noGameReason: NoGameReason?,
)

fun Round.toDto() = RoundDto(number = number, label = label, start = start, end = end)
