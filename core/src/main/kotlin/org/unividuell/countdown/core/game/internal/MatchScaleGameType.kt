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
import org.unividuell.countdown.core.matchscale.MatchScaleMeasure
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.JsonNodeFactory
import kotlin.math.abs

/** One silhouette as the client draws it. No real-world size: that is the answer. */
data class MatchScaleSilhouette(
    val name: String,
    val path: String,
    val width: Double,
    val height: Double,
    val attribution: String?,
)

/**
 * The real size behind one silhouette: [axis] (`length` or `height`) is [metres] long, per [source];
 * [kind] names what was measured, `null` where the dataset does not say; [subject] the concrete thing
 * behind a generic name, `null` where the name is concrete itself.
 * Solution only — the metres of A and B give the factor away.
 */
data class MatchScaleMeasureDto(
    val axis: String,
    val kind: String?,
    val metres: Double,
    val source: String,
    val subject: String? = null,
)

/**
 * The frozen round. [factor] — how many times larger B really is than A — is the answer and never
 * leaves the server through the payload. It follows from the drawn pair, and the metres behind it
 * stay in the dataset: seeing the pair is not knowing the factor.
 *
 * [tolerance] is the gate in phase one, a share of the true size either way (`0.25`: a guess
 * within `factor × 0.75 .. factor × 1.25` qualifies), and `null` in phase two, where only the
 * closest guess scores.
 *
 * [measureA] and [measureB] are as secret as [factor] and leave only through the solution. They
 * default to `null` so rounds frozen before they existed still read, as does [categoryLegend].
 */
data class MatchScaleParams(
    val category: String,
    val categoryName: String,
    val categoryLegend: String? = null,
    val a: MatchScaleSilhouette,
    val b: MatchScaleSilhouette,
    val factor: Double,
    val tolerance: Double?,
    val measureA: MatchScaleMeasureDto? = null,
    val measureB: MatchScaleMeasureDto? = null,
)

/**
 * What the player needs in order to play: both silhouettes and the tolerance. Every field comes
 * from the presentation stream (the pair) or from the phase alone ([tolerance]); [MatchScaleParams.factor]
 * is absent. The field-set test names every field, so a new one is a deliberate act.
 */
data class MatchScalePayload(
    val categoryName: String,
    val categoryLegend: String?,
    val a: MatchScaleSilhouette,
    val b: MatchScaleSilhouette,
    val tolerance: Double?,
) : GamePayload

/** What the player is told about their guess. [withinTolerance] is `null` in phase two: no gate, no verdict. */
data class MatchScaleOutcome(
    val scale: Double,
    val deviation: Double,
    val withinTolerance: Boolean?,
) : GameOutcome

/**
 * What the round looked like, once the player has guessed. [tolerance] is `null` in phase two;
 * [a] and [b] are the measures behind the factor, `null` where the dataset has none.
 */
data class MatchScaleSolution(
    val factor: Double,
    val tolerance: Double?,
    val a: MatchScaleMeasureDto?,
    val b: MatchScaleMeasureDto?,
) : GameSolution

/**
 * Augenmaß: drag silhouette B to the size it would have next to the fixed A, at real scale.
 *
 * The guess is the factor the player sizes B by, judged as a share of the true size: 25 % too large
 * and 25 % too small are equally far off, as the table's „Abstand“ reads.
 */
@Component
class MatchScaleGameType(
    private val dataset: MatchScaleDataset,
    private val mapper: ObjectMapper,
) : GameType<MatchScaleParams> {

    override val id = "match-scale"
    override val displayName = "Augenmaß"
    override val paramsType = MatchScaleParams::class.java

    override fun isAvailable(context: RoundContext) = dataset.isPlayable

    override fun draw(random: GameRandom, context: RoundContext): MatchScaleParams {
        // Category key -> pairs shown in this edition, unordered.
        val used = context.previousParams
            .map { mapper.treeToValue(it, MatchScaleParams::class.java) }
            .groupBy({ it.category }, { setOf(it.a.name, it.b.name) })
            .mapValues { (_, pairs) -> pairs.toSet() }

        val pair = dataset.draw(presentation = random.presentation, used = used)

        return MatchScaleParams(
            category = pair.category.key,
            categoryName = pair.category.displayName,
            categoryLegend = pair.category.legend,
            a = pair.a.toSilhouette(),
            b = pair.b.toSilhouette(),
            factor = pair.factor,
            tolerance = when (context.phase) {
                Phase.ONE -> TOLERANCE
                Phase.TWO -> null
            },
            measureA = pair.a.measure?.toDto(),
            measureB = pair.b.measure?.toDto(),
        )
    }

    override fun present(params: MatchScaleParams) = MatchScalePayload(
        categoryName = params.categoryName,
        categoryLegend = params.categoryLegend,
        a = params.a,
        b = params.b,
        tolerance = params.tolerance,
    )

    override fun judge(params: MatchScaleParams, guess: JsonNode): Judgement {
        val scale = guess.get("scale")
            ?.takeIf { it.isNumber }
            ?.doubleValue()
            ?: throw InvalidGuessException("guess must carry a numeric 'scale'")
        if (!scale.isFinite() || scale <= 0.0) throw InvalidGuessException("scale must be positive, was $scale")

        // A share of the true size, as the table shows it: Abstand ÷ Lösung. Capped, since a huge
        // finite scale over a small factor overflows to infinity.
        val deviation = (abs(scale - params.factor) / params.factor).coerceAtMost(Double.MAX_VALUE)
        val withinTolerance = params.tolerance?.let { deviation <= it + EPSILON }

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
        tolerance = params.tolerance,
        a = params.measureA,
        b = params.measureB,
    )

    private fun MatchScaleEntry.toSilhouette() = MatchScaleSilhouette(
        name = name,
        path = path,
        width = width,
        height = height,
        attribution = attribution,
    )

    private fun MatchScaleMeasure.toDto() =
        MatchScaleMeasureDto(axis = axis.key, kind = kind?.key, metres = metres, source = source, subject = subject)

    companion object {
        /** Phase one: at most 25 % too large or too small. */
        const val TOLERANCE = 0.25

        /** Floating-point slack: `factor × 1.25` must sit inside the gate it names. */
        private const val EPSILON = 1e-9
    }
}
