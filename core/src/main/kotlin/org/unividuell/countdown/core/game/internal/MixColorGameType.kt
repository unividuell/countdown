package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.mixcolor.Pigment
import org.unividuell.countdown.core.mixcolor.mixHex
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * The frozen round. [recipe] (pigment key to drops) is the answer, [targetHex] its mix.
 * [tolerance] is the ΔE gate in phase one, `null` in phase two: the closest mix scores.
 */
data class MixColorParams(
    val recipe: Map<String, Int>,
    val targetHex: String,
    val capacity: Int,
    val tolerance: Double?,
)

data class MixColorPigmentDto(val key: String, val name: String, val hex: String)

/** What the player sees: the target, the glass size and the pigments. Never the recipe. */
data class MixColorPayload(
    val targetHex: String,
    val capacity: Int,
    val pigments: List<MixColorPigmentDto>,
) : GamePayload

/** What the round was, once the player has guessed. */
data class MixColorSolution(
    val recipe: Map<String, Int>,
    val tolerance: Double?,
) : GameSolution

/**
 * Anrührung: mix the target colour drop by drop from a few pigments.
 * Each drop is a stage; the steps carry the mix so far.
 */
@Component
class MixColorGameType(
    private val mapper: ObjectMapper,
) : GameType<MixColorParams> {

    override val id = "mix-color"
    override val displayName = "Anrührung"
    override val paramsType = MixColorParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): MixColorParams {
        val rng = random.presentation

        // 2 or 3 pigments, one drop each; the rest of the total lands one by one on them.
        // e.g. [c, y], total 5 -> c:1 y:1, then 3 picks -> c:2 y:3
        val chosen = rng.sample(Pigment.entries, if (rng.nextBoolean()) 3 else 2)
        val total = rng.nextIntBetween(chosen.size, CAPACITY)

        val drops = chosen.associateWith { 1 }.toMutableMap()
        repeat(total - chosen.size) {
            val pigment = rng.pick(chosen)
            drops[pigment] = drops.getValue(pigment) + 1
        }

        return MixColorParams(
            recipe = drops.mapKeys { it.key.key },
            targetHex = checkNotNull(mixHex(drops)),
            capacity = CAPACITY,
            tolerance = when (context.phase) {
                Phase.ONE -> TOLERANCE
                Phase.TWO -> null
            },
        )
    }

    override fun present(params: MixColorParams) = MixColorPayload(
        targetHex = params.targetHex,
        capacity = params.capacity,
        pigments = Pigment.entries.map { MixColorPigmentDto(key = it.key, name = it.displayName, hex = it.hex) },
    )

    // Replaced by the context form in the judge task.
    override fun judge(params: MixColorParams, guess: JsonNode): Judgement =
        throw InvalidGuessException("mix-color judges from the stored steps")

    override fun solution(params: MixColorParams) = MixColorSolution(
        recipe = params.recipe,
        tolerance = params.tolerance,
    )

    /** One stage per drop, plus the start. */
    override fun stages(params: MixColorParams) = params.capacity + 1

    override fun stagesScore(params: MixColorParams) = false

    override fun requiresReveal(params: MixColorParams) = false

    override fun scoresOnDuration(params: MixColorParams) = false

    companion object {
        const val CAPACITY = 20

        /** Phase one: at most this ΔE from the target. */
        const val TOLERANCE = 4.0
    }
}
