package org.unividuell.countdown.core.game.internal

import tools.jackson.databind.JsonNode

/**
 * What a game shows the player. It carries what is needed to play and **never the solution** — pinned
 * by a serialisation test per game that asserts the exact field set, so a new field cannot slip in
 * unnoticed. A marker interface rather than `Any` so that test has something to hang on.
 */
interface GamePayload

/**
 * What the server computed about a guess, in the game's own words — the only thing the player is
 * told about their result. The framework's own comparison values (`qualifies`, `deviation`) stay
 * inside: a generic "this far off" field would be a third way out of the server next to
 * [GamePayload] and [GameSolution], and those we want countable.
 */
interface GameOutcome

/**
 * What a game may show once the viewer has spent their guess — the solution, and whatever else is
 * only meaningful next to it. A second way out, separate from [GamePayload] on purpose: putting it in
 * the payload would also put it in front of the guess, and the payload's field-set test would lose
 * its meaning.
 */
interface GameSolution

/**
 * What a game may say about a guess — and only that.
 *
 * **The game judges, the framework awards.** How many points a guess is worth, and whether it takes
 * somebody else's away, is the same for every game and lives in `awardFor` and `pointsFor`.
 */
data class Judgement(
    /** Eligible for points at all: Guess Hue's tolerance in phase one, unconditionally true in two. */
    val qualifies: Boolean,
    /**
     * Distance from the solution, smaller is better, `0.0` = perfect. The one value the framework
     * must be able to **compare** without being able to **compute** it. A pure right/wrong game
     * returns `0.0` for every hit — then all hits are level, and that is enough.
     */
    val deviation: Double,
    val outcome: GameOutcome?,
)

/** What a game may know about the round it is drawing for. */
data class RoundContext(val roundNumber: Int, val phase: Phase)

/**
 * A game the framework can announce.
 *
 * Deliberately in `internal`: the adapters live in this module, so nobody outside implements this,
 * and a published API without consumers would be a false signal. If the direction ever flips to the
 * plugin shape — game modules implementing it themselves — the contract moves to the base package.
 *
 * A game is a **pure function of its params**, not of a seed: [draw] runs once, at announce time, and
 * everything afterwards reads the frozen result. That is what makes a round unchangeable when the
 * content behind it changes.
 */
interface GameType<P : Any> {
    /** URL segment and column value, e.g. `guess-hue`. Unique across the catalogue. */
    val id: String

    /** German display name, e.g. „Farbausmalung“. */
    val displayName: String

    /** For deserialising [params] back out of the round's `params` column. */
    val paramsType: Class<P>

    /**
     * Draw the round, once, at announce time. Everything the player will be shown must come from
     * [GameRandom.presentation] — see there for why that is not a stylistic preference.
     */
    fun draw(random: GameRandom, context: RoundContext): P

    /**
     * What the player sees. Must never carry the solution, and must be drawn from
     * [GameRandom.presentation] — a payload value from the solution's stream narrows the answer even
     * when it does not resemble it.
     */
    fun present(params: P): GamePayload

    /**
     * Judge [guess] against the frozen params. Throws [InvalidGuessException] on a malformed or
     * out-of-range guess — **before** anything is written, so a typo does not consume the one
     * attempt the player has.
     */
    fun judge(params: P, guess: JsonNode): Judgement

    /**
     * What may be shown once the viewer has guessed. `null` — the default — is a game that reveals
     * nothing, and the default is right here because it is the safe direction: a game that
     * implements nothing gives nothing away.
     */
    fun solution(params: P): GameSolution? = null
}
