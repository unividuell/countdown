package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.JsonNode

/**
 * What a game shows the player. It carries what is needed to play and **never the solution** —
 * pinned by a serialisation test per game that asserts the exact field set, so a new field cannot
 * slip in unnoticed. A marker interface rather than `Any` so that test has something to hang on.
 */
interface LabPayload

/** What the server reports back after it re-derived the solution and scored the guess. */
interface LabOutcome

/**
 * A game the lab can host.
 *
 * **This is a guess, not a contract.** It was derived from zero existing games. When the first
 * real game needs a different shape — an explicit reveal step, several guesses per round, a
 * clock — this interface changes and the game does not. Adapting a real game means adding an
 * implementation *here*, in `gamelab`, that calls the game module's public API; no production
 * module may depend on the lab.
 */
interface LabGame {
    /** URL segment, e.g. `sample`. Unique across all lab games; a collision fails the boot. */
    val id: String

    /** German display name, shown in the lab's header. */
    val displayName: String

    /** Derives the round from [seed]. Pure and idempotent, so no round state is ever stored. */
    fun reveal(seed: Int): LabPayload

    /** Re-derives the solution from [seed] and scores [guess]. Never trusts the client. */
    fun score(seed: Int, guess: JsonNode): LabOutcome
}
