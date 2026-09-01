package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.spotobject.CountryLookup
import org.unividuell.countdown.core.spotobject.SpotObjectTerms
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.JsonNodeFactory

/**
 * The frozen round. [term] is the whole of it — this is the first game with **no round secret**,
 * so nothing here is withheld.
 *
 * [timed] is how the phase reaches [SpotObjectGameType.requiresReveal], the same shape Guess Hue's
 * `toleranceDeg` and Musterung's `timed` already have.
 */
data class SpotObjectParams(val term: String, val timed: Boolean)

/** One field, and the field-set test pins that. There is nothing else the player needs. */
data class SpotObjectPayload(val term: String) : GamePayload

/**
 * What the server worked out about the tip: which country it stands in, as ISO-3166-1 alpha-2, or
 * `null` when the lookup could not answer.
 *
 * The outcome is the right place for it because it is exactly what the server *computed* — the
 * panorama and the angles are already in the guess and travel to everyone who has played anyway.
 */
data class SpotObjectOutcome(val country: String?) : GameOutcome

/**
 * Weltanschauung: find a named object anywhere in Street View.
 *
 * There is no stored solution — the world is large and there are arbitrarily many right answers.
 * Whoever submits is right; the other players decide afterwards whether they believe it. That is
 * what `allowsPeerReview` turns on, and it is the whole of this game's judging.
 */
@Component
class SpotObjectGameType(
    private val terms: SpotObjectTerms,
    private val countries: CountryLookup,
) : GameType<SpotObjectParams> {

    override val id = "spot-object"
    override val displayName = "Weltanschauung"
    override val paramsType = SpotObjectParams::class.java

    /**
     * Everything comes from the presentation stream, and the solution stream stays unused: there
     * is no withheld value for a published one to narrow.
     */
    override fun draw(random: GameRandom, context: RoundContext) = SpotObjectParams(
        term = terms.draw(random.presentation),
        timed = context.phase == Phase.TWO,
    )

    override fun present(params: SpotObjectParams) = SpotObjectPayload(term = params.term)

    /** Phase two only — there the clock is the result, and the reveal is what starts it, once. */
    override fun requiresReveal(params: SpotObjectParams) = params.timed

    /** The one game whose tips are judged by the other players rather than by the machine. */
    override fun allowsPeerReview(params: SpotObjectParams) = true

    /**
     * The shape first, and only then the network call: a typo must not consume the one attempt,
     * and it must not cost a lookup either.
     */
    override fun judge(params: SpotObjectParams, guess: JsonNode): Judgement {
        val panoId = guess.get("panoId")?.takeIf { it.isString }?.stringValue()?.trim()
        if (panoId.isNullOrEmpty()) throw InvalidGuessException("guess must carry a non-empty 'panoId'")
        val heading = number(guess = guess, field = "heading", min = -180.0, max = 360.0)
        val pitch = number(guess = guess, field = "pitch", min = -90.0, max = 90.0)
        val zoom = number(guess = guess, field = "zoom", min = 0.0, max = 5.0)

        return Judgement(
            // Whoever submits is right. The other players may take it back afterwards, and that
            // happens in the framework, not here.
            qualifies = true,
            // Nothing to be far from. In a timed round the framework overwrites this with the
            // reveal-to-guess duration — the clock is its, not the game's.
            deviation = 0.0,
            // Rebuilt from the four validated values rather than passed through: the framework
            // stores what comes back here and republishes it to everyone who has played, so a
            // `lat`/`lng` pasted in alongside the tip would be a coordinate in the database.
            guess = JsonNodeFactory.instance.objectNode()
                .put("panoId", panoId)
                .put("heading", heading)
                .put("pitch", pitch)
                .put("zoom", zoom),
            outcome = SpotObjectOutcome(country = countries.countryOf(panoId)),
        )
    }

    /** Nothing to reveal: there was never an answer to hold back. */
    override fun solution(params: SpotObjectParams) = null

    /** Validates one angle and hands its value back — the stored tip is rebuilt from these. */
    private fun number(guess: JsonNode, field: String, min: Double, max: Double): Double {
        val value = guess.get(field)?.takeIf { it.isNumber }?.doubleValue()
            ?: throw InvalidGuessException("guess must carry a numeric '$field'")
        if (value < min || value > max) {
            throw InvalidGuessException("'$field' must lie in [$min, $max], was $value")
        }
        return value
    }
}
