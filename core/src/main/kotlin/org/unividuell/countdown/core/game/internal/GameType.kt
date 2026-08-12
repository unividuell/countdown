package org.unividuell.countdown.core.game.internal

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * What a game shows the player. It carries what is needed to play and **never the solution** — pinned
 * by a serialisation test per game that asserts the exact field set, so a new field cannot slip in
 * unnoticed. A marker interface rather than `Any` so that test has something to hang on.
 */
interface GamePayload

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

    fun draw(random: SeededRandom, context: RoundContext): P

    /** What the player sees — never the solution, not even something it can be derived from. */
    fun present(params: P): GamePayload
}
