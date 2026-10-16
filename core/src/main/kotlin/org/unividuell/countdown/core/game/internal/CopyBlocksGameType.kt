package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.copyblocks.Block
import org.unividuell.countdown.core.copyblocks.BlockType
import org.unividuell.countdown.core.copyblocks.Cell
import org.unividuell.countdown.core.copyblocks.CopyBlocksGenerator
import org.unividuell.countdown.core.copyblocks.CopyBlocksJudge
import org.unividuell.countdown.core.copyblocks.Fit
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * The frozen round. Nothing in it is secret: the template is the payload.
 *
 * [timed] is how the phase reaches [CopyBlocksGameType.requiresReveal], as in Musterung.
 */
data class CopyBlocksParams(
    /** Edge length of the starting cube — of the draw and of the building field. */
    val grid: Int,
    /**
     * The round's types — the first N of the order, frozen as a list: a later change of the order
     * changes no old round.
     */
    val types: List<BlockType>,
    /** The template, normalised: the smallest coordinate per axis is 0. */
    val blocks: List<Block>,
    val timed: Boolean,
)

/** What the player rebuilds and builds with. [types] is the hotbar, including a type the template never uses. */
data class CopyBlocksPayload(val grid: Int, val types: List<BlockType>, val blocks: List<Block>) : GamePayload

/**
 * The verdict in template coordinates, so the reveal can mark it on the template: [fit] maps the
 * guess onto it, [missing] carries the template's type, [extra] and [wrongType] the guess's.
 */
data class CopyBlocksOutcome(
    val correct: Boolean,
    val fit: Fit,
    val missing: List<Block>,
    val extra: List<Block>,
    val wrongType: List<Block>,
) : GameOutcome

/**
 * Blockierung as an announceable game; `copyblocks` knows nothing about it.
 *
 * Everything is drawn from the presentation stream: the template is shown from the reveal on and
 * nothing about it stays protected afterwards, so there is no secret for another stream to guard.
 * The draw order — block count, type count, template — is part of the round's identity.
 *
 * The ceiling: the solution is in the payload, so a script can send the template back unchanged —
 * a safe point in phase one, the fastest hit in phase two. Accepted, as for Musterung.
 */
@Component
class CopyBlocksGameType(private val mapper: ObjectMapper) : GameType<CopyBlocksParams> {

    override val id = "copy-blocks"
    override val displayName = "Blockierung"
    override val paramsType = CopyBlocksParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): CopyBlocksParams {
        val count = random.presentation.nextIntBetween(min = MIN_BLOCKS, maxInclusive = MAX_BLOCKS)
        val types = BlockType.entries.take(
            random.presentation.nextIntBetween(min = MIN_TYPES, maxInclusive = BlockType.entries.size),
        )
        val blocks = CopyBlocksGenerator.generate(
            presentation = random.presentation, grid = GRID, count = count, types = types,
        )

        return CopyBlocksParams(grid = GRID, types = types, blocks = blocks, timed = context.phase == Phase.TWO)
    }

    override fun present(params: CopyBlocksParams) =
        CopyBlocksPayload(grid = params.grid, types = params.types, blocks = params.blocks)

    /** Phase two only, as in Musterung: there the reveal starts the clock, exactly once. */
    override fun requiresReveal(params: CopyBlocksParams) = params.timed

    override fun scoresOnDuration(params: CopyBlocksParams) = params.timed

    override fun judge(params: CopyBlocksParams, guess: JsonNode): Judgement {
        val blocks = blocksOf(guess = guess, types = params.types)
        val verdict = CopyBlocksJudge.judge(template = params.blocks, guess = blocks)

        return Judgement(
            qualifies = verdict.correct,
            // Hit or miss has no distance. For a timed round the framework replaces this with the duration.
            deviation = 0.0,
            guess = mapper.valueToTree(mapOf("blocks" to blocks)),
            outcome = CopyBlocksOutcome(
                correct = verdict.correct,
                fit = verdict.fit,
                missing = verdict.missing,
                extra = verdict.extra,
                wrongType = verdict.wrongType,
            ),
        )
    }

    private fun blocksOf(guess: JsonNode, types: List<BlockType>): List<Block> {
        val nodes = guess.get("blocks")
            ?.takeIf { it.isArray && it.size() in 1..MAX_GUESS_BLOCKS }
            ?: throw InvalidGuessException("guess must carry 'blocks', an array of 1 to $MAX_GUESS_BLOCKS blocks")

        val blocks = nodes.mapIndexed { index, node -> blockOf(node = node, index = index, types = types) }

        // The judge counts one vote per guess block; a doubled cell would vote twice.
        val seen = mutableSetOf<Cell>()
        blocks.forEachIndexed { index, block ->
            if (!seen.add(block.cell())) {
                throw InvalidGuessException("blocks[$index] repeats the cell ${block.cell()}")
            }
        }

        return blocks
    }

    private fun blockOf(node: JsonNode, index: Int, types: List<BlockType>): Block {
        val code = node.get("type")
            ?.takeIf { it.isString }
            ?.stringValue()
            ?: throw InvalidGuessException("blocks[$index] must carry a string 'type'")
        val type = types.firstOrNull { it.name == code }
            ?: throw InvalidGuessException("blocks[$index].type must be one of ${types.map { it.name }}, was '$code'")

        return Block(
            x = coordinateOf(node = node, index = index, field = "x"),
            y = coordinateOf(node = node, index = index, field = "y"),
            z = coordinateOf(node = node, index = index, field = "z"),
            type = type,
        )
    }

    private fun coordinateOf(node: JsonNode, index: Int, field: String): Int {
        val value = node.get(field)
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            ?.takeIf { it.isIntegralNumber && it.canConvertToInt() }
            ?.asInt()
            ?: throw InvalidGuessException("blocks[$index] must carry an integral '$field' in int range")
        if (value !in -MAX_COORDINATE..MAX_COORDINATE) {
            throw InvalidGuessException(
                "blocks[$index].$field must lie in [-$MAX_COORDINATE, $MAX_COORDINATE], was $value",
            )
        }

        return value
    }

    companion object {
        const val GRID = 6
        const val MIN_BLOCKS = 8
        const val MAX_BLOCKS = 58
        const val MIN_TYPES = 3

        /** The wire's limits: what the board lets a player place and what the server accepts. */
        const val MAX_GUESS_BLOCKS = 200
        const val MAX_COORDINATE = 64
    }
}
