package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GameStepAnswer
import org.unividuell.countdown.core.game.GuessContext
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.InvalidStepException
import org.unividuell.countdown.core.game.StepContext
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.mixcolor.Pigment
import org.unividuell.countdown.core.mixcolor.deltaE
import org.unividuell.countdown.core.mixcolor.mixHex
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.JsonNodeFactory

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

/** The mix after a drop: the glass the player sees. */
data class MixColorGlass(val hex: String) : GameStepAnswer

/** What the player is told about their glass. [withinTolerance] is `null` in phase two: no gate, no verdict. */
data class MixColorOutcome(
    val hex: String,
    val recipe: Map<String, Int>,
    val deviation: Double,
    val withinTolerance: Boolean?,
) : GameOutcome

/**
 * Anrührung: mix the target colour drop by drop from a few pigments.
 * Each drop is a stage; the steps carry the mix so far.
 */
@Component
class MixColorGameType : GameType<MixColorParams> {

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

    /** Drops live in the stored steps, so the guess needs them: see the context form. */
    override fun judge(params: MixColorParams, guess: JsonNode): Judgement =
        throw InvalidGuessException("mix-color judges from the stored steps")

    override fun judge(params: MixColorParams, guess: JsonNode, context: GuessContext): Judgement {
        if (!guess.hasExactly("drops")) throw InvalidGuessException("guess must carry 'drops' only")
        val drops = guess.get("drops").takeIf { it.isInt }?.intValue()
            ?: throw InvalidGuessException("drops must be an integer")

        // The stored steps are the glass; the guess only has to agree with their count.
        // e.g. steps [c, y] -> {c:1, y:1}, guess {"drops":2}
        val recipe = context.steps.map { step ->
            step?.let(::pigmentOf) ?: throw InvalidGuessException("a stored drop is not a pigment")
        }.groupingBy { it }.eachCount()
        if (recipe.isEmpty()) throw InvalidGuessException("an empty glass cannot be judged")
        if (drops != context.steps.size) {
            throw InvalidGuessException("drops $drops differ from the ${context.steps.size} stored")
        }

        val hex = checkNotNull(mixHex(recipe))
        val deviation = deltaE(a = hex, b = params.targetHex)
        val withinTolerance = params.tolerance?.let { deviation <= it + EPSILON }

        return Judgement(
            // No gate in phase two: the framework's CLOSEST_ONLY picks the winner.
            qualifies = withinTolerance ?: true,
            deviation = deviation,
            guess = JsonNodeFactory.instance.objectNode().put("drops", drops),
            outcome = MixColorOutcome(
                hex = hex,
                recipe = recipe.mapKeys { it.key.key },
                deviation = deviation,
                withinTolerance = withinTolerance,
            ),
        )
    }

    override fun solution(params: MixColorParams) = MixColorSolution(
        recipe = params.recipe,
        tolerance = params.tolerance,
    )

    /** One stage per drop, plus the start. */
    override fun stages(params: MixColorParams) = params.capacity + 1

    override fun step(params: MixColorParams, stage: Int, input: JsonNode?, context: StepContext): GameStepAnswer {
        val base = input?.let { pigmentOf(it) }
            ?: throw InvalidStepException("a drop must carry a pigment 'base' only")

        val earlier = context.earlier.mapNotNull { it?.let(::pigmentOf) }

        return MixColorGlass(hex = checkNotNull(mixHex((earlier + base).groupingBy { it }.eachCount())))
    }

    override fun stagesScore(params: MixColorParams) = false

    override fun requiresReveal(params: MixColorParams) = false

    override fun scoresOnDuration(params: MixColorParams) = false

    /** The pigment of a drop `{"base":"c"}`; null for anything else. */
    private fun pigmentOf(drop: JsonNode): Pigment? =
        drop.takeIf { it.hasExactly("base") }
            ?.get("base")?.takeIf { it.isString }?.stringValue()
            ?.let { Pigment.ofKey(it) }

    private fun JsonNode.hasExactly(vararg fields: String) = isObject && propertyNames().toSet() == fields.toSet()

    companion object {
        private const val EPSILON = 1e-9

        const val CAPACITY = 20

        /** Phase one: at most this ΔE from the target. */
        const val TOLERANCE = 4.0
    }
}
