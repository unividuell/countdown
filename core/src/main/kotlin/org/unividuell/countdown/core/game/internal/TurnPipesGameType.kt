package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameScene
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.turnpipes.Leak
import org.unividuell.countdown.core.turnpipes.PipeFlow
import org.unividuell.countdown.core.turnpipes.PipeKind
import org.unividuell.countdown.core.turnpipes.TurnPipesGenerator
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * The frozen round. Nothing in it is secret: the board is the payload, the solution follows from it.
 *
 * [timed] is how the phase reaches [TurnPipesGameType.requiresReveal], as in Blockierung.
 */
data class TurnPipesParams(
    /** Edge length of the board, 6..8, from the difficulty. */
    val size: Int,
    /** Kind per cell, row by row; exactly one INLET and one OUTLET. */
    val kinds: List<PipeKind>,
    /** Rotation per cell at the start, 0..3. */
    val start: List<Int>,
    /** The drawn solution: rotation per cell. */
    val solution: List<Int>,
    /** The cells of the drawn solution from inlet to outlet — each exactly once. */
    val path: List<Int>,
    val timed: Boolean,
)

/** What may be with the client under the cover: the empty plates, nothing of the puzzle. */
data class TurnPipesScene(val size: Int) : GameScene

/** What the player turns: the kinds and the scrambled rotations. */
data class TurnPipesPayload(val size: Int, val kinds: List<PipeKind>, val start: List<Int>) : GamePayload

/** The drawn solution, shown next to the results. */
data class TurnPipesSolution(val rotations: List<Int>, val path: List<Int>) : GameSolution

/** Where the water ran ([wet], in flow order) and, if it did not arrive, where it leaked. */
data class TurnPipesOutcome(val correct: Boolean, val wet: List<Int>, val leak: Leak?) : GameOutcome

/**
 * Verrohrung as an announceable game; `turnpipes` knows nothing about it.
 *
 * Everything is drawn from the presentation stream: the board is shown from the reveal on and the
 * solution follows from it, so there is no secret for another stream to guard. The draw order —
 * generate, then scramble — is part of the round's identity.
 *
 * The ceiling: the board is in the payload, so a script can solve it and send the rotations — a safe
 * point in phase one, a fast hit in phase two. Accepted, as for Blockierung.
 */
@Component
class TurnPipesGameType(private val mapper: ObjectMapper) : GameType<TurnPipesParams> {

    override val id = "turn-pipes"
    override val displayName = "Verrohrung"
    override val paramsType = TurnPipesParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): TurnPipesParams {
        val size = sizeFor(context.difficulty)
        val board = TurnPipesGenerator.generate(random = random.presentation, size = size)
        val start = TurnPipesGenerator.scramble(random = random.presentation, board = board)

        return TurnPipesParams(
            size = size,
            kinds = board.kinds,
            start = start,
            solution = board.solution,
            path = board.path,
            timed = context.phase == Phase.TWO,
        )
    }

    override fun present(params: TurnPipesParams) =
        TurnPipesPayload(size = params.size, kinds = params.kinds, start = params.start)

    override fun scene(params: TurnPipesParams) = TurnPipesScene(size = params.size)

    override fun solution(params: TurnPipesParams) =
        TurnPipesSolution(rotations = params.solution, path = params.path)

    /** Phase two only, as in Blockierung: there the reveal starts the clock, exactly once. */
    override fun requiresReveal(params: TurnPipesParams) = params.timed

    override fun scoresOnDuration(params: TurnPipesParams) = params.timed

    override fun judge(params: TurnPipesParams, guess: JsonNode): Judgement {
        val rotations = rotationsOf(guess = guess, size = params.size)
        val flow = PipeFlow.trace(size = params.size, kinds = params.kinds, rotations = rotations)
        val correct = flow.reached && flow.wet.size == params.size * params.size

        return Judgement(
            qualifies = correct,
            // Hit or miss has no distance. For a timed round the framework replaces this with the duration.
            deviation = 0.0,
            guess = mapper.valueToTree(mapOf("rotations" to rotations)),
            outcome = TurnPipesOutcome(correct = correct, wet = flow.wet, leak = flow.leak),
        )
    }

    private fun rotationsOf(guess: JsonNode, size: Int): List<Int> {
        val cells = size * size
        val nodes = guess.get("rotations")
            ?.takeIf { it.isArray && it.size() == cells }
            ?: throw InvalidGuessException("guess must carry 'rotations', an array of $cells rotations")

        return nodes.mapIndexed { index, node ->
            val value = node
                // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
                .takeIf { it.isIntegralNumber && it.canConvertToInt() }
                ?.asInt()
                ?: throw InvalidGuessException("rotations[$index] must be an integral number in int range")
            if (value !in 0..3) throw InvalidGuessException("rotations[$index] must lie in [0, 3], was $value")

            value
        }
    }

    companion object {
        const val MIN_SIZE = 6
        const val MAX_SIZE = 8

        /** 0.0..0.33 → 6, 0.34..0.66 → 7, 0.67..1.0 → 8. */
        fun sizeFor(difficulty: Double): Int = MIN_SIZE + minOf(MAX_SIZE - MIN_SIZE, (difficulty * 3).toInt())
    }
}
