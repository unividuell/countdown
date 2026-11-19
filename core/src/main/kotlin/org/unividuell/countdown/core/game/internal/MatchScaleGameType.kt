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
import org.unividuell.countdown.core.matchscale.MatchScaleDataset
import org.unividuell.countdown.core.matchscale.MatchScaleEntry
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.JsonNodeFactory
import kotlin.math.abs
import kotlin.math.ln

/** One silhouette as the client draws it. No real-world size: that is the answer. */
data class MatchScaleSilhouette(
    val name: String,
    val path: String,
    val width: Double,
    val height: Double,
    val attribution: String?,
)

/**
 * The frozen round. [factor] — how many times larger B really is than A — is the answer and never
 * leaves the server through the payload. It follows from the drawn pair, and the metres behind it
 * stay in the dataset: seeing the pair is not knowing the factor.
 *
 * [toleranceFactor] is the gate in phase one (a guess within `factor / 1.1 .. factor × 1.1`
 * qualifies) and `null` in phase two, where only the closest guess scores.
 */
data class MatchScaleParams(
    val category: String,
    val categoryName: String,
    val a: MatchScaleSilhouette,
    val b: MatchScaleSilhouette,
    val factor: Double,
    val toleranceFactor: Double?,
)

/**
 * What the player needs in order to play: both silhouettes and the tolerance. Every field comes
 * from the presentation stream (the pair) or from the phase alone ([toleranceFactor]); [MatchScaleParams.factor]
 * is absent. The field-set test names every field, so a new one is a deliberate act.
 */
data class MatchScalePayload(
    val categoryName: String,
    val a: MatchScaleSilhouette,
    val b: MatchScaleSilhouette,
    val toleranceFactor: Double?,
) : GamePayload

/** What the player is told about their guess. [withinTolerance] is `null` in phase two: no gate, no verdict. */
data class MatchScaleOutcome(
    val scale: Double,
    val deviation: Double,
    val withinTolerance: Boolean?,
) : GameOutcome

/** What the round looked like, once the player has guessed. [toleranceFactor] is `null` in phase two. */
data class MatchScaleSolution(val factor: Double, val toleranceFactor: Double?) : GameSolution

/**
 * Augenmessung: drag silhouette B to the size it would have next to the fixed A, at real scale.
 *
 * The guess is the factor the player sizes B by, judged on a log scale so that twice too large and
 * half as large are equally far off.
 */
@Component
class MatchScaleGameType(
    private val dataset: MatchScaleDataset,
    private val mapper: ObjectMapper,
) : GameType<MatchScaleParams> {

    override val id = "match-scale"
    override val displayName = "Augenmessung"
    override val paramsType = MatchScaleParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): MatchScaleParams {
        // Category key -> names shown in this edition, as A or B.
        val used = context.previousParams
            .map { mapper.treeToValue(it, MatchScaleParams::class.java) }
            .groupBy({ it.category }, { listOf(it.a.name, it.b.name) })
            .mapValues { (_, names) -> names.flatten().toSet() }

        val pair = dataset.draw(presentation = random.presentation, used = used)

        return MatchScaleParams(
            category = pair.category.key,
            categoryName = pair.category.displayName,
            a = pair.a.toSilhouette(),
            b = pair.b.toSilhouette(),
            factor = pair.factor,
            toleranceFactor = when (context.phase) {
                Phase.ONE -> TOLERANCE_FACTOR
                Phase.TWO -> null
            },
        )
    }

    override fun present(params: MatchScaleParams) = MatchScalePayload(
        categoryName = params.categoryName,
        a = params.a,
        b = params.b,
        toleranceFactor = params.toleranceFactor,
    )

    override fun judge(params: MatchScaleParams, guess: JsonNode): Judgement {
        val scale = guess.get("scale")
            ?.takeIf { it.isNumber }
            ?.doubleValue()
            ?: throw InvalidGuessException("guess must carry a numeric 'scale'")
        if (!scale.isFinite() || scale <= 0.0) throw InvalidGuessException("scale must be positive, was $scale")

        // Difference of logs, not log of a ratio: scale / factor overflows for a huge finite scale.
        val deviation = abs(ln(scale) - ln(params.factor))
        val withinTolerance = params.toleranceFactor?.let { deviation <= ln(it) + EPSILON }

        return Judgement(
            // No gate in phase two: the framework's CLOSEST_ONLY picks the winner.
            qualifies = withinTolerance ?: true,
            deviation = deviation,
            // Rebuilt, not passed through: the framework stores and republishes whatever returns here.
            guess = JsonNodeFactory.instance.objectNode().put("scale", scale),
            outcome = MatchScaleOutcome(scale = scale, deviation = deviation, withinTolerance = withinTolerance),
        )
    }

    /** Never: the game does not score on time, so a reveal would only cost a tap. */
    override fun requiresReveal(params: MatchScaleParams) = false

    override fun scoresOnDuration(params: MatchScaleParams) = false

    override fun solution(params: MatchScaleParams) = MatchScaleSolution(
        factor = params.factor,
        toleranceFactor = params.toleranceFactor,
    )

    private fun MatchScaleEntry.toSilhouette() = MatchScaleSilhouette(
        name = name,
        path = path,
        width = width,
        height = height,
        attribution = attribution,
    )

    companion object {
        /** Phase one: at most 10 % off on the log scale. */
        const val TOLERANCE_FACTOR = 1.1

        /** Floating-point slack: `factor × 1.1` must sit inside the gate it names. */
        private const val EPSILON = 1e-9
    }
}
