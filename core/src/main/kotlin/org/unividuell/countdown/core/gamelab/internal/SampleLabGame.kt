package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.gamelab.LabGame
import org.unividuell.countdown.core.gamelab.LabOutcome
import org.unividuell.countdown.core.gamelab.LabPayload
import org.unividuell.countdown.core.rng.SeededRandom

/** What the player needs to play: the window. The number inside it is the answer and stays here. */
data class SamplePayload(val lowerBound: Int, val upperBound: Int) : LabPayload

/** Where the target sits relative to the guess — the player's perspective, not the target's. */
enum class SampleDirection { HIGHER, LOWER, EXACT }

data class SampleOutcome(
    val correct: Boolean,
    val distance: Int,
    val direction: SampleDirection,
) : LabOutcome

/**
 * The lab's stand-in game. Deliberately not the real one and deliberately dumb: it exists to prove
 * the path — deterministic draw, solution never in the payload, server-side scoring, one guess per
 * round, both resets, two players — and it stays afterwards as the lab's own smoke test and as the
 * worked example of how a game plugs in.
 *
 * `distance` and `direction` together reveal the target to whoever reads them, and `LabRoundResponse`
 * broadcasts every entry — `guess` and `outcome` alike — to every tester in the round, including one
 * who has not guessed yet. So a tester can read the target off someone else's entry before spending
 * their own attempt; this is the only client-side route to the solution, seed or no seed. That is
 * acceptable *only* because the lab is a non-production dev tool with no competitive stake to
 * protect. A real game must make its own, deliberate decision about whether to withhold `others`
 * until `me != null` — see the anti-cheat spec.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class SampleLabGame : LabGame {

    override val id = "sample"
    override val displayName = "Zahlenraten (Attrappe)"

    /**
     * The lab's stand-in has no competitive stake, so the whole round stays visible — that is what
     * makes it useful for watching two testers at once. A real game decides this on its own terms;
     * see the class KDoc above.
     */
    override val revealsOthersBeforeGuess = true

    override fun reveal(seed: Int): SamplePayload {
        val (lower, upper, _) = draw(seed)
        return SamplePayload(lower, upper)
    }

    override fun score(seed: Int, guess: JsonNode): SampleOutcome {
        val (lower, upper, secret) = draw(seed)
        val value = guess.get("value")
            ?.takeIf { it.isInt }
            ?.asInt()
            ?: throw InvalidGuessException("guess must carry an integer 'value'")
        if (value !in lower..upper) throw InvalidGuessException("guess must lie in $lower..$upper")
        return SampleOutcome(
            correct = value == secret,
            distance = kotlin.math.abs(secret - value),
            direction = when {
                value < secret -> SampleDirection.HIGHER
                value > secret -> SampleDirection.LOWER
                else -> SampleDirection.EXACT
            },
        )
    }

    /**
     * **The draw order is a contract**, same rule as `GuessHueDataset.draw`: reorder these three
     * calls and every round ever derived from a stored seed changes. The window is drawn *before*
     * the secret so the payload varies with the seed without carrying anything secret.
     */
    private fun draw(seed: Int): Triple<Int, Int, Int> {
        val rng = SeededRandom.fromSeed(seed)
        val lower = rng.nextIntBetween(1, 900)
        val upper = lower + WINDOW_WIDTH
        return Triple(lower, upper, rng.nextIntBetween(lower, upper))
    }

    private companion object {
        const val WINDOW_WIDTH = 99
    }
}
