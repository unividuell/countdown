package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.iam.Avatar
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

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
 * One player's involvement, as far as the viewer may see it.
 *
 * `qualifies` and `deviation` are **not** here on purpose: they are the framework's comparison
 * values, not display data. What the player learns about a result is the game-shaped [outcome], and
 * where they stand is [points]. A generic "this far off" field would be a third way out of the server
 * next to `present()` and `solution()`, and those we want countable.
 */
data class PlayDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val revealedAt: Instant,
    val guessedAt: Instant?,
    val guess: JsonNode?,
    val outcome: JsonNode?,
    val points: Int?,
)

/**
 * `round` is null when there is no grid at all (no run, no date). It is present with `game == null`
 * when the round exists but carries no game — the window, or an empty catalogue.
 *
 * The four play fields default to their empty state so a no-game answer stays one expression. Each of
 * them is a gate, and every gate is closed **server-side**: a payload the browser never receives
 * cannot be read out of the network tab either.
 */
data class RoundResponse(
    val round: RoundDto?,
    val game: GameDto?,
    val noGameReason: NoGameReason?,
    /** Only once the viewer has revealed — the reveal is what starts their clock. */
    val payload: GamePayload? = null,
    /** Only once the viewer has guessed. */
    val solution: GameSolution? = null,
    val me: PlayDto? = null,
    /** Empty until the viewer has guessed. Unconditional: there is no game for which the other
     *  answer is right, so there is no switch to get it wrong with. */
    val others: List<PlayDto> = emptyList(),
)

fun Round.toDto() = RoundDto(number = number, label = label, start = start, end = end)
