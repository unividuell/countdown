package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.gamelab.LabGame
import org.unividuell.countdown.core.gamelab.LabOutcome
import org.unividuell.countdown.core.gamelab.LabPayload
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * What the player needs in order to play: the text, and the colour the wheel starts on.
 *
 * `GuessHueTarget.hue` — the answer — is absent, and so is anything it could be derived from. The
 * starting angle is drawn independently of the target, so it narrows nothing; saturation and
 * lightness are the same for every angle on the wheel.
 */
data class GuessHuePayload(
    val description: String,
    val initHue: Double,
    /** Fractions, not percent: `hsl()` in the browser takes them as-is, hex would need converting. */
    val saturation: Double,
    val lightness: Double,
) : LabPayload

/**
 * Guess Hue in the lab: the input side only.
 *
 * It draws through the `guesshue` module's public API and adds nothing of its own — the round is
 * `GuessHueDataset.draw`, unchanged, so what the lab shows is what the real game will show. Per
 * the lab's direction rule, this adapter lives here and `guesshue` knows nothing about it.
 *
 * Guesses are accepted, validated and stored; they are **not** scored. Tolerance, points and the
 * view after the round are the game framework's decisions, and this class must not pre-empt them.
 */
@Component
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class GuessHueLabGame(private val dataset: GuessHueDataset) : LabGame {

    override val id = "guess-hue"
    override val displayName = "Farbausmalung"

    /**
     * Without scoring, another tester's angle is the only signal the round carries — and whoever
     * produced it had read the same description. Showing it to someone who has not guessed yet
     * would simply be the answer.
     */
    override val revealsOthersBeforeGuess = false

    override fun reveal(seed: Int): GuessHuePayload {
        val target = dataset.draw(SeededRandom.fromSeed(seed))
        return GuessHuePayload(
            description = target.entry.description,
            initHue = target.initHue,
            saturation = target.saturation,
            lightness = target.lightness,
        )
    }

    /**
     * Validates only. `null` means "accepted, not scored" — see [LabGame.score].
     *
     * The angle is checked as a number in `[0, 360)`, not as an integer: an angle is not an
     * enumeration, and an input method with a finer resolution must not fail here.
     */
    override fun score(seed: Int, guess: JsonNode): LabOutcome? {
        val hue = guess.get("hue")
            ?.takeIf { it.isNumber }
            ?.asDouble()
            ?: throw InvalidGuessException("guess must carry a numeric 'hue'")
        if (hue < 0.0 || hue >= 360.0) throw InvalidGuessException("hue must lie in [0, 360), was $hue")
        return null
    }
}
