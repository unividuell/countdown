package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.guesshue.GuessHueDataset
import org.unividuell.countdown.core.guesshue.GuessHueTolerance
import org.unividuell.countdown.core.rng.SeededRandom

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
 * `GuessHueParams.hue` — the answer — is absent as a field, and none of `initHue`, `saturation` or
 * `lightness` *is* it. But none of them is independent of it either, in the cryptanalytic sense:
 * `GuessHueDataset.draw` pulls all of them from **one** `SeededRandom` stream, in order (entry pick,
 * hue jitter, saturation, lightness, `initHue`), and `SeededRandom.nextDouble()`'s output is
 * invertible back to the generator state. Three published doubles are enough to reconstruct that
 * state, step it backwards past the jitter draw, and read the target hue exactly — even though none
 * of the three published values equals it or is computed from it. **Do not add a fourth published
 * field on the assumption that presentation values are safe** — the actual fix is two independently
 * seeded streams (draw vs. presentation), which needs a change in `guesshue` and is planned for the
 * slice that publishes this payload, not this one.
 */
data class GuessHuePayload(
    val description: String,
    val initHue: Double,
    /** Fractions, not percent: `hsl()` in the browser takes them as-is, hex would need converting. */
    val saturation: Double,
    val lightness: Double,
) : GamePayload

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

    override fun draw(random: SeededRandom, context: RoundContext): GuessHueParams {
        val target = dataset.draw(random)
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
    )
}
