package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.Vote
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

/**
 * [requiresReveal] rides on the game rather than on the round, because it is the game's answer — and
 * it is therefore absent exactly when there is no game to answer for.
 */
data class GameDto(val id: String, val displayName: String, val requiresReveal: Boolean)

/**
 * One cast ballot, with the name attached. Nothing about the vote is secret — not the counts and
 * not who cast them. Anonymity is what makes voting careless; among friends, being asked „warum
 * hast du mich geflaggt?“ is the point.
 */
data class VoteView(val userId: UUID, val username: String, val value: Vote)

/**
 * One other player's involvement, as far as the viewer may see it.
 *
 * `qualifies` and `deviation` are **not** here on purpose: they are the framework's comparison
 * values, not display data. What the player learns about a result is the game-shaped [outcome], and
 * where they stand is [points]. A generic "this far off" field would be a third way out of the server
 * next to `present()` and `solution()`, and those we want countable.
 *
 * Neither are the timestamps: when somebody else revealed and when they guessed says how long they
 * sat on the round, and that is between them and the server. The type is separate from [MyPlayDto]
 * rather than nulling the fields out, so a stamp cannot be added back for everyone by accident.
 */
data class OtherPlayDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    /**
     * Safe although timestamps are not: an "other" row is listed only once that player is finished
     * (see RoundResponses) — a final stage is a result, not a live tactic.
     */
    val stage: Int,
    val guess: JsonNode?,
    val outcome: JsonNode?,
    val points: Int?,
    /**
     * How long this player took, from their reveal to their guess — and `null` unless the round's
     * game asked for a deliberate reveal.
     *
     * The timestamps above stay absent: *when* somebody looked is theirs. But for a game that scores
     * on time the duration is not behaviour, it is the result — under `CLOSEST_ONLY` it is *why* the
     * winner won, and „what the others played and what it scored is the round, and they get it“. The
     * condition is `GameType.requiresReveal`, not a new switch: that flag already means „the clock is
     * part of this game“, so a game where the duration is nobody's business never publishes one.
     */
    val durationMs: Long?,
    /** Every vote cast on this tip, by name. Empty for a game without peer review. */
    val votes: List<VoteView> = emptyList(),
    /**
     * Whether this tip currently scores nothing because of the review — the server's own answer,
     * override included. The client never re-derives it: the rule lives in one place, and the
     * client has no business owning a second copy of it.
     */
    val struck: Boolean = false,
    /** The game master's verdict, shown openly: it would otherwise be the one hidden move. */
    val adminOverride: Boolean? = null,
)

/**
 * The viewer's own row: [OtherPlayDto] plus the two stamps that are theirs to know. [guessedAt] is
 * what the client derives „still playing“ or „done“ from; [revealedAt] is published because it is the
 * viewer's own and costs nothing to say.
 */
data class MyPlayDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val stage: Int,
    val revealedAt: Instant,
    val guessedAt: Instant?,
    val guess: JsonNode?,
    val outcome: JsonNode?,
    val points: Int?,
    /** The viewer's own — see [OtherPlayDto]. */
    val durationMs: Long?,
    /** Every vote cast on this tip, by name. Empty for a game without peer review. */
    val votes: List<VoteView> = emptyList(),
    /**
     * Whether this tip currently scores nothing because of the review — the server's own answer,
     * override included. The client never re-derives it: the rule lives in one place, and the
     * client has no business owning a second copy of it.
     */
    val struck: Boolean = false,
    /** The game master's verdict, shown openly: it would otherwise be the one hidden move. */
    val adminOverride: Boolean? = null,
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
    /**
     * The next older announced round of this run, or `null` for „ganz am Anfang“. Present on every
     * round answer, the action responses included: the client replaces its whole round object with
     * each of them, so a pointer only on the `GET` would lose the history on the first guess.
     */
    val previousRoundNumber: Int? = null,
    /** Only once the viewer has revealed — the reveal is what starts their clock. */
    val payload: GamePayload? = null,
    /** Only once the viewer has guessed. */
    val solution: GameSolution? = null,
    val me: MyPlayDto? = null,
    /** Empty until the viewer has guessed. Unconditional: there is no game for which the other
     *  answer is right, so there is no switch to get it wrong with. */
    val others: List<OtherPlayDto> = emptyList(),
    /**
     * The rule and the stake this round was frozen with — `null` exactly when there is no game. They
     * belong to the round, not to the game type: the same game pays differently in phase two.
     * `awardRule` is what the copy needs — it is how `RoundCard` says a `CLOSEST_ONLY` score is
     * provisional („bester Tipp bisher“). `awardPoints` is published for the stake display that is
     * not built yet; keep it, the lab's response already carries it and a later face will name it.
     */
    val awardRule: AwardRule? = null,
    val awardPoints: Int? = null,
    /**
     * Whether **this viewer** may set an override here. Viewer-scoped like `me`, not a property of
     * the round: in the product it means „is this community's admin“, in the lab it is always
     * true. The component is the same in both worlds and asks nobody — it is told.
     */
    val canOverride: Boolean = false,
)

/**
 * The guess, plus the round the client believes it is playing. „Current“ is not the same thing for a
 * client and a server once a day boundary passes between the two, and the difference would show up as
 * a verdict against a target the player never saw.
 */
data class GuessRequest(val roundNumber: Int, val guess: JsonNode)

/** Advance the staged reveal: from the stage the client believes it is on. */
data class SkipRequest(val roundNumber: Int, val fromStage: Int)

/** Spend the round without an answer. */
data class GiveUpRequest(val roundNumber: Int)

/** `null` withdraws the ballot — one verb for casting, changing and taking back. */
data class VoteRequest(val value: Vote?)

/** `null` hands the decision back to the vote. */
data class OverrideRequest(val value: Boolean?)

fun Round.toDto() = RoundDto(number = number, label = label, start = start, end = end)
