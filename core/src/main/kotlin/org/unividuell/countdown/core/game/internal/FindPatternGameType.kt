package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.findpattern.FindPatternBoard
import org.unividuell.countdown.core.findpattern.FindPatternImages
import org.unividuell.countdown.core.findpattern.FindPatternLayout
import org.unividuell.countdown.core.findpattern.FindPatternPalette
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import tools.jackson.databind.JsonNode

/**
 * The frozen round. [patternStartIndex] is the answer and never leaves the server; [blocks] is the
 * board, which does — as an image.
 *
 * [palette] is the drawn result, not the input it came from: freezing the four tones rather than the
 * reference point keeps `present()` and `solution()` field reads, and it means a later change to the
 * palette arithmetic cannot repaint a round that is already running.
 *
 * [timed] is how the phase reaches [requiresReveal] — the same shape as Guess Hue's `toleranceDeg`.
 * Phase one is played at leisure, phase two against the clock.
 */
data class FindPatternParams(
    val blocks: List<Int>,
    val patternStartIndex: Int,
    val palette: List<String>,
    val delta: Double,
    val timed: Boolean,
)

/**
 * What the player needs in order to play — and **not a single colour**. The board and the sought run
 * are images; the three numbers are what the client lays its cell grid out from.
 *
 * Adding a field here means changing the field-set test in `FindPatternGameTypeTest`, which is the
 * point: a colour, a block value or an index would each hand over part of the answer.
 */
data class FindPatternPayload(
    val cols: Int,
    val rows: Int,
    val patternLength: Int,
    val boardImage: String,
    val patternImage: String,
) : GamePayload

/** Right or wrong — the whole verdict this game has to give. */
data class FindPatternOutcome(val correct: Boolean) : GameOutcome

/**
 * What the reveal may show: the board as numbers, the sought run, the palette those numbers name,
 * the difficulty, and every start index that would have counted.
 */
data class FindPatternSolution(
    val blocks: List<Int>,
    val pattern: List<Int>,
    val palette: List<String>,
    val delta: Double,
    val startIndices: List<Int>,
) : GameSolution

/**
 * Musterung as an announceable game. Like Guess Hue's and Song Snippet's, the adapter lives here and
 * `findpattern` knows nothing about it.
 *
 * The draw order out of the presentation stream — blocks, delta, palette reference — is part of the
 * round's identity: a seed reproduces a round only as long as it stays.
 */
@Component
class FindPatternGameType : GameType<FindPatternParams> {

    override val id = "find-pattern"
    override val displayName = "Musterung"
    override val paramsType = FindPatternParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): FindPatternParams {
        val blocks = FindPatternBoard.blocks(presentation = random.presentation)
        val delta = FindPatternBoard.delta(presentation = random.presentation)
        return FindPatternParams(
            blocks = blocks,
            // The only draw from the solution stream. Everything above is published as an image.
            patternStartIndex = FindPatternBoard.patternStartIndex(solution = random.solution),
            palette = FindPatternPalette.of(
                reference = random.presentation.nextDouble(), delta = delta,
            ),
            delta = delta,
            timed = context.phase == Phase.TWO,
        )
    }

    override fun present(params: FindPatternParams) = FindPatternPayload(
        cols = FindPatternLayout.COLS,
        rows = FindPatternLayout.ROWS,
        patternLength = FindPatternLayout.PATTERN_LENGTH,
        boardImage = FindPatternImages.board(blocks = params.blocks, palette = params.palette),
        patternImage = FindPatternImages.pattern(
            pattern = patternOf(params = params), palette = params.palette,
        ),
    )

    /**
     * Phase two only. In phase one the clock is not part of the result, so a deliberate reveal would
     * cost a tap for nothing; in phase two it is the whole second half of „Winner Takes It All“ —
     * find the pattern *and* be fastest — and the reveal is what starts it, exactly once.
     */
    override fun requiresReveal(params: FindPatternParams) = params.timed

    override fun judge(params: FindPatternParams, guess: JsonNode): Judgement {
        val startIndex = guess.get("startIndex")
            // isIntegralNumber() alone is not enough: it is true for LongNode/BigIntegerNode
            // regardless of magnitude, and their asInt() throws JsonNodeException once the value
            // does not fit in 32 bits — canConvertToInt() is the guard that actually reflects that.
            ?.takeIf { it.isIntegralNumber && it.canConvertToInt() }
            ?.asInt()
            ?: throw InvalidGuessException("guess must carry an integral 'startIndex' in int range")
        if (startIndex < 0 || startIndex > FindPatternLayout.LAST_START_INDEX) {
            throw InvalidGuessException(
                "startIndex must lie in [0, ${FindPatternLayout.LAST_START_INDEX}], was $startIndex",
            )
        }
        val correct =
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = startIndex) ==
                patternOf(params = params)
        return Judgement(
            qualifies = correct,
            // Right or wrong has no distance. For a timed round the framework replaces this with the
            // duration between reveal and guess — the clock is its, not the game's.
            deviation = 0.0,
            outcome = FindPatternOutcome(correct = correct),
        )
    }

    override fun solution(params: FindPatternParams): FindPatternSolution {
        val pattern = patternOf(params = params)
        return FindPatternSolution(
            blocks = params.blocks,
            pattern = pattern,
            palette = params.palette,
            delta = params.delta,
            startIndices = FindPatternBoard.matches(blocks = params.blocks, pattern = pattern),
        )
    }

    private fun patternOf(params: FindPatternParams): List<Int> =
        FindPatternBoard.patternAt(blocks = params.blocks, startIndex = params.patternStartIndex)
}
