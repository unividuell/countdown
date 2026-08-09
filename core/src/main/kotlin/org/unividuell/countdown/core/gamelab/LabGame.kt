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
 * What a game may show once the viewer has spent their guess — the solution, and whatever else is
 * only meaningful next to it. A second way out of the server, separate from [LabPayload] on
 * purpose: putting it in the payload would also put it in front of the guess, and the payload's
 * field-set test would lose its meaning.
 */
interface LabSolution

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

    /**
     * Whether the other testers' entries are visible before the viewer has guessed.
     *
     * **There is deliberately no default.** Every game states it, because inheriting it is exactly
     * the mistake: a game whose only feedback is another player's guess gives the round away to
     * whoever reads the list first. Decide it per game, with the anti-cheat spec in hand.
     */
    val revealsOthersBeforeGuess: Boolean

    /**
     * Re-derives the solution from [seed] and scores [guess]. Never trusts the client.
     *
     * Returns `null` for a game that accepts and **validates** guesses without scoring them yet —
     * the guess is stored, the entry simply carries no outcome. Rejecting an invalid guess stays
     * this method's job either way: [LabService] calls it before the store, so a malformed guess
     * must throw rather than return `null`.
     */
    fun score(seed: Int, guess: JsonNode): LabOutcome?

    /**
     * What may be shown once the viewer has spent their guess. `null` — the default — is a game
     * that reveals nothing.
     *
     * **Here a default is right, unlike [revealsOthersBeforeGuess].** There the unsafe direction
     * ("show it") is the convenient one, so every game has to say it out loud. Here the default
     * *is* the safe direction: a game that implements nothing reveals nothing.
     */
    fun solution(seed: Int): LabSolution? = null
}
