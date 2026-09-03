package org.unividuell.countdown.core.gamelab.internal

import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.Vote
import org.unividuell.countdown.core.iam.Avatar
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/** One vote cast on a lab tip, by name — mirrors `VoteView` in the real round's `RoundDtos`. */
data class LabVoteView(val userId: UUID, val username: String, val value: Vote)

/**
 * [points] is what the framework awarded, not what the game judged: `qualifies` and `deviation` stay
 * on the server here for the same reason they do in the real round — they are comparison values, and
 * what a tester needs to see is the game-shaped [outcome] plus the number.
 */
data class LabEntryDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val guess: JsonNode,
    val outcome: GameOutcome?,
    val points: Int,
    /** Display order only — never a score. */
    val at: Instant,
    /** The stage this entry was recorded at — same idea as [LabRoundResponse.myStage], per entry. */
    val stage: Int,
    /** Reveal-to-guess, as in a real round. `null` for a game that does not score on time. */
    val durationMs: Long?,
    /** Every vote cast on this tip, by name. Empty for a game without peer review. */
    val votes: List<LabVoteView> = emptyList(),
    /**
     * Whether this tip currently scores nothing because of the review — the server's own answer,
     * override included. The client never re-derives it: the rule lives in one place.
     */
    val struck: Boolean = false,
    /** The game master's verdict, shown openly: it would otherwise be the one hidden move. */
    val adminOverride: Boolean? = null,
)

/**
 * Every endpoint answers with this, so the client can redraw after any action without a second
 * request. [tookOverRound] is the only thing the client cannot work out for itself — it does not know
 * which round the server had stored before this call. [solution] is the only thing it must never work
 * out for itself.
 *
 * [awardRule] and [awardPoints] are shown on purpose: the phase selector is only useful if the tester
 * can see which rule they just switched to and what it pays.
 */
data class LabRoundResponse(
    val seed: Int,
    val phase: Phase,
    val game: String,
    val displayName: String,
    val awardRule: AwardRule,
    val awardPoints: Int,
    /**
     * `null` until [revealed] — withheld the same way [solution] already is: for a game that asked
     * for a deliberate reveal, the payload IS the board (Musterung's board image, e.g.), so leaving
     * it in an unrevealed response would let the network tab show what the click is supposed to gate.
     */
    val payload: GamePayload?,
    /** Filled only once the viewer has an entry of their own; `null` in front of that gate. */
    val solution: GameSolution?,
    val me: LabEntryDto?,
    val others: List<LabEntryDto>,
    val tookOverRound: Boolean,
    /** The viewer's own stage — `0` for a single-stage game, or a staged one not yet advanced. */
    val myStage: Int,
    /**
     * Whether the viewer may see the board. Always `true` for a game that never asked for a
     * deliberate reveal — there is nothing to gate. The one field the page acts on; nothing here is
     * derived client-side.
     */
    val revealed: Boolean,
    /**
     * Whether the viewer may set the override. Always `true` — in the lab everybody is the game
     * master, the one deliberate difference from the product: the lab models no roles anywhere.
     */
    val canOverride: Boolean = true,
)

/** The body of a skip request — mirrors `SkipRequest` in the real round's `RoundDtos`. */
data class LabSkipRequest(val fromStage: Int)

/** `null` withdraws the ballot — mirrors `VoteRequest` in the real round's `RoundDtos`. */
data class LabVoteRequest(val value: Vote?)

/** `null` hands the decision back to the vote — mirrors `OverrideRequest`. */
data class LabOverrideRequest(val value: Boolean?)
