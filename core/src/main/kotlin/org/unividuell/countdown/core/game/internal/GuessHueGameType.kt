package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import tools.jackson.databind.JsonNode

/**
 * The frozen round. `hue` is the answer and never leaves the server.
 *
 * [toleranceDeg] is both the gate and the arc the client draws: in phase one a guess must land inside
 * it to qualify, and in phase two there is **no gate** — only the closest guess scores, however far
 * off everyone was — so the value is `null` there. A boolean beside it would be a second way of
 * saying the same thing.
 */
data class GuessHueParams(
    val description: String,
    val hue: Double,
    val saturation: Double,
    val lightness: Double,
    val initHue: Double,
    val toleranceDeg: Double?,
)

/**
 * What the player needs in order to play: the text, and the colour the wheel starts on.
 *
 * `GuessHueParams.hue` — the answer — is absent as a field, and now genuinely independent of every
 * field that *is* here: all four are drawn from the presentation stream, the hue's jitter from the
 * solution stream, and the two streams are seeded independently (see `GameRandom`). Pinned by
 * `GuessHueDrawTest`, which holds one stream fixed while varying the other.
 *
 * A new field is still not free: it must come from the presentation stream, and the field-set test
 * below must name it.
 *
 * [toleranceDeg] is the exception that proves the rule is about the *answer*, not about early
 * disclosure: it is set from the phase alone (`GuessHueTolerance.DEGREES` in phase one, `null` in
 * phase two — see `GuessHueParams.toleranceDeg`), identical for every round of that phase, so it
 * carries no information about where `hue` lies. It already reaches the client after the guess via
 * `GuessHueSolution.toleranceDeg`; publishing it here only moves that same, phase-constant value
 * earlier — before the guess, so the board can say honestly whether a near miss still counts.
 */
data class GuessHuePayload(
    val description: String,
    val initHue: Double,
    /** Fractions, not percent: `hsl()` in the browser takes them as-is, hex would need converting. */
    val saturation: Double,
    val lightness: Double,
    val toleranceDeg: Double?,
) : GamePayload

/**
 * What the player learns about their guess: how far off, and — in phase one — whether that was inside
 * the arc. `withinTolerance` is `null` in phase two, because there is no gate to be inside of; a
 * `false` there would claim a verdict the round never made.
 */
data class GuessHueOutcome(val deviationDeg: Double, val withinTolerance: Boolean?) : GameOutcome

/**
 * What the round looked like, once the player has spent their guess: the angle that was sought and how
 * wide around it counted. Leaves the server through `RoundResponse.solution`, never the payload.
 *
 * [toleranceDeg] is `null` in phase two — nothing to draw, because nothing was required.
 */
data class GuessHueSolution(val targetHue: Double, val toleranceDeg: Double?) : GameSolution

/**
 * Guess Hue as an announceable game.
 *
 * The adapter lives here and `guesshue` knows nothing about it — a change to the [GameType] contract
 * stays local to this module, and "which games exist" has exactly one place. The draw itself is
 * `GuessHueDataset.draw`, unchanged, so what is announced is what the dataset says.
 */
@Component
class GuessHueGameType(private val dataset: GuessHueDataset) : GameType<GuessHueParams> {

    override val id = "guess-hue"
    override val displayName = "Farbausmalung"
    override val paramsType = GuessHueParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): GuessHueParams {
        val target = dataset.draw(solution = random.solution, presentation = random.presentation)
        return GuessHueParams(
            description = target.entry.description,
            hue = target.hue,
            saturation = target.saturation,
            lightness = target.lightness,
            initHue = target.initHue,
            toleranceDeg = when (context.phase) {
                Phase.ONE -> GuessHueTolerance.DEGREES
                Phase.TWO -> null
            },
        )
    }

    override fun present(params: GuessHueParams) = GuessHuePayload(
        description = params.description,
        initHue = params.initHue,
        saturation = params.saturation,
        lightness = params.lightness,
        toleranceDeg = params.toleranceDeg,
    )

    /**
     * The angle is read as a number in `[0, 360)`, not as an integer: an angle is not an enumeration,
     * and an input method with a finer resolution must not fail here.
     */
    override fun judge(params: GuessHueParams, guess: JsonNode): Judgement {
        val hue = guess.get("hue")
            ?.takeIf { it.isNumber }
            ?.asDouble()
            ?: throw InvalidGuessException("guess must carry a numeric 'hue'")
        if (hue < 0.0 || hue >= 360.0) throw InvalidGuessException("hue must lie in [0, 360), was $hue")

        val deviation = distanceOnCircle(a = hue, b = params.hue)
        val tolerance = params.toleranceDeg
        return Judgement(
            // No gate in phase two: everybody is a candidate, and the framework's CLOSEST_ONLY picks
            // the winner. In phase one the inherited tolerance decides.
            qualifies = tolerance == null || deviation <= tolerance,
            deviation = deviation,
            outcome = GuessHueOutcome(
                deviationDeg = deviation,
                withinTolerance = tolerance?.let { deviation <= it },
            ),
        )
    }

    override fun solution(params: GuessHueParams) = GuessHueSolution(
        targetHue = params.hue,
        toleranceDeg = params.toleranceDeg,
    )
}

/** The original's `distanceOnCircle`: the shorter way round the wheel, so 350 to 10 is 20 degrees. */
private fun distanceOnCircle(a: Double, b: Double): Double {
    val d = ((a - b) % 360.0 + 360.0) % 360.0
    return if (d > 180.0) 360.0 - d else d
}
