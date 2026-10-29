package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.echolocate.Cell
import org.unividuell.countdown.core.echolocate.EchoHit
import org.unividuell.countdown.core.echolocate.EchoLocateClips
import org.unividuell.countdown.core.echolocate.FieldLayout
import org.unividuell.countdown.core.echolocate.Layout
import org.unividuell.countdown.core.echolocate.NoiseSource
import org.unividuell.countdown.core.echolocate.Pin
import org.unividuell.countdown.core.echolocate.distanceToCentre
import org.unividuell.countdown.core.echolocate.echoOf
import org.unividuell.countdown.core.echolocate.inBlock
import org.unividuell.countdown.core.echolocate.pinOf
import org.unividuell.countdown.core.game.AssetVisibility
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameStepAnswer
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.InvalidStepException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.math.min

/**
 * The frozen round. [targets] and [noises] are the secret and never leave the server before the
 * player's own guess; [clipIds] are soft references into the audio pool and, once the round is
 * announced, only provenance: the assets are the round's own copies.
 *
 * [targets] are one cell per clip, in [clipIds]' order. [toleranceCells] is phase one's margin
 * around a target (1 → the 3 × 3 block); `null` in phase two, where there is no gate.
 */
data class EchoLocateParams(
    val clipIds: List<UUID>,
    val grid: Int,
    val reach: Double,
    val speed: Double,
    val pings: Int,
    val bedDb: Double,
    val noiseDb: Double,
    val targets: List<Cell>,
    val noises: List<NoiseSource>,
    val toleranceCells: Int?,
)

/** What the player needs to lay out the field and the sound; [clips] is how many to find. */
data class EchoLocatePayload(
    val grid: Int,
    val reach: Double,
    val speed: Double,
    val pings: Int,
    val clips: Int,
    val bedDb: Double,
    val noiseDb: Double,
    val toleranceCells: Int?,
) : GamePayload

/** What one ping heard: delays only, never a position. */
data class EchoLocateEcho(val hits: List<EchoHit>) : GameStepAnswer

/** Where everything was hidden, shown once the viewer has spent their guess. */
data class EchoLocateSolution(
    val targets: List<Cell>,
    val noises: List<NoiseSource>,
    val toleranceCells: Int?,
) : GameSolution

/**
 * What the player learns about their pins. [distance] is the mean over all clips, [pinOf] the
 * pin the server assigned to each target, so the resolution draws the server's assignment instead
 * of working it out again. [withinTolerance] is `null` in phase two.
 */
data class EchoLocateOutcome(
    val distance: Double,
    val withinTolerance: Boolean?,
    val pinOf: List<Int>,
) : GameOutcome

/**
 * Peilung as an announceable game; `echolocate` knows nothing about it.
 *
 * The draws are split by publication: count and clips from the scene stream (they sound at the
 * first ping and their assets are on the wire before the reveal), the cells from the solution
 * stream, targets before noise.
 *
 * The ceiling: every echo is readable, so whoever turns three delays into distances knows the target
 * cell exactly. Stage C — the server mixing each ping into a finished track, so that only samples
 * leave it — is named in the spec and not built.
 */
@Component
class EchoLocateGameType(
    private val clips: EchoLocateClips,
    private val mapper: ObjectMapper,
) : GameType<EchoLocateParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "echo-locate"
    override val displayName = "Peilung"
    override val paramsType = EchoLocateParams::class.java

    override fun isAvailable(context: RoundContext) = clips.playable(context.communityId).isNotEmpty()

    override fun draw(random: GameRandom, context: RoundContext): EchoLocateParams {
        val playable = clips.playable(context.communityId)

        // Two clips with the probability `difficulty`, and only if the pool has a second.
        val wantsTwo = random.scene.nextDouble() < context.difficulty
        val count = if (wantsTwo && playable.size >= 2) 2 else 1

        val used = context.previousParams
            .flatMap { mapper.treeToValue(it, EchoLocateParams::class.java).clipIds }
            .toSet()
        val fresh = playable.filterNot { it in used }

        // A small pool must not starve: what the fresh clips cannot fill comes from all of them.
        val first = random.scene.sample(items = fresh, k = min(a = count, b = fresh.size))
        val clipIds = first + random.scene.sample(items = playable - first.toSet(), k = count - first.size)

        val layout = FieldLayout.place(random = random.solution, grid = GRID, clips = count, noises = NOISES)

        return EchoLocateParams(
            clipIds = clipIds,
            grid = GRID,
            reach = REACH,
            speed = SPEED,
            pings = PINGS,
            bedDb = BED_DB,
            noiseDb = NOISE_DB,
            targets = layout.targets,
            noises = layout.noises,
            toleranceCells = when (context.phase) {
                Phase.ONE -> TOLERANCE_CELLS
                Phase.TWO -> null
            },
        )
    }

    override fun present(params: EchoLocateParams) = EchoLocatePayload(
        grid = params.grid,
        reach = params.reach,
        speed = params.speed,
        pings = params.pings,
        clips = params.clipIds.size,
        bedDb = params.bedDb,
        noiseDb = params.noiseDb,
        toleranceCells = params.toleranceCells,
    )

    /** Never, in either phase: the field is there at once, and the clock is statistics. */
    override fun requiresReveal(params: EchoLocateParams) = false

    override fun scoresOnDuration(params: EchoLocateParams) = false

    /** One stage per ping, plus the one before the first. They count pings and score nothing. */
    override fun stages(params: EchoLocateParams) = params.pings + 1

    override fun stagesScore(params: EchoLocateParams) = false

    override fun step(params: EchoLocateParams, stage: Int, input: JsonNode?): GameStepAnswer {
        val node = input?.takeIf { it.hasExactly("x", "y") }
            ?: throw InvalidStepException("a ping must carry 'x' and 'y' only")
        val field = 0.0..params.grid.toDouble()

        val x = node.get("x").numberIn(field) ?: throw InvalidStepException("x must be a number in $field")
        val y = node.get("y").numberIn(field) ?: throw InvalidStepException("y must be a number in $field")

        return EchoLocateEcho(
            hits = echoOf(
                x = x,
                y = y,
                layout = Layout(targets = params.targets, noises = params.noises),
                reach = params.reach,
                speed = params.speed,
            ),
        )
    }

    override fun judge(params: EchoLocateParams, guess: JsonNode): Judgement {
        if (!guess.hasExactly("pins", "rings")) throw InvalidGuessException("guess must carry 'pins' and 'rings' only")

        val pins = pinsOf(node = guess.get("pins"), params = params)
        val rings = ringsOf(node = guess.get("rings"), params = params)

        // order[i] is the pin that serves target i; pins carry no name.
        val order = pinOf(pins = pins, targets = params.targets)
        val served = params.targets.mapIndexed { i, target -> pins[order[i]] to target }

        val mean = served.map { (pin, target) -> distanceToCentre(pin = pin, cell = target) }.average()
        val within = params.toleranceCells?.let { tolerance ->
            served.all { (pin, target) ->
                inBlock(pin = pin, target = target, grid = params.grid, tolerance = tolerance)
            }
        }

        return Judgement(
            // No gate in phase two: everybody is a candidate, and CLOSEST_ONLY picks the winner.
            qualifies = within ?: true,
            deviation = mean,
            guess = mapper.valueToTree(mapOf("pins" to pins, "rings" to rings)),
            outcome = EchoLocateOutcome(distance = mean, withinTolerance = within, pinOf = order),
        )
    }

    override fun solution(params: EchoLocateParams) = EchoLocateSolution(
        targets = params.targets,
        noises = params.noises,
        toleranceCells = params.toleranceCells,
    )

    /**
     * One asset per clip, named by its place in [EchoLocateParams.clipIds]. It opens with the reveal;
     * until then it travels sealed. A clip that is gone — or cannot be prepared — leaves its place
     * silent, the others still sound.
     */
    override fun produceAssets(params: EchoLocateParams): List<RoundAsset> =
        params.clipIds.mapIndexedNotNull { place, clipId ->
            preparedClip(id = clipId, place = place)?.let { bytes ->
                RoundAsset(
                    name = "clip-$place",
                    visibility = AssetVisibility.FromStage(0),
                    mediaType = "audio/wav",
                    bytes = bytes,
                )
            }
        }

    private fun preparedClip(id: UUID, place: Int): ByteArray? {
        val bytes = try {
            clips.prepared(id)
        } catch (e: Exception) {
            logger.warn { "echo-locate clip $id (place $place) cannot be prepared ($e); the round is silent there" }
            return null
        }

        if (bytes == null) logger.warn { "echo-locate clip $id (place $place) is gone; the round is silent there" }

        return bytes
    }

    private fun pinsOf(node: JsonNode, params: EchoLocateParams): List<Pin> {
        val clipCount = params.clipIds.size
        // The size is checked before any value is read: a huge array costs a comparison, not a loop.
        if (!node.isArray || node.size() != clipCount) {
            throw InvalidGuessException("pins must be an array of exactly $clipCount pins")
        }

        val field = 0.0..params.grid.toDouble()

        return node.mapIndexed { i, pin ->
            if (!pin.hasExactly("x", "y")) throw InvalidGuessException("pins[$i] must carry 'x' and 'y' only")

            val x = pin.get("x").numberIn(field) ?: throw InvalidGuessException("pins[$i].x must lie in $field")
            val y = pin.get("y").numberIn(field) ?: throw InvalidGuessException("pins[$i].y must lie in $field")

            Pin(x = x, y = y)
        }
    }

    /** Radii by ping. A ring without a ping is not checked: it scores nothing and gives nothing away. */
    private fun ringsOf(node: JsonNode, params: EchoLocateParams): List<List<Double>> {
        val clipCount = params.clipIds.size
        if (!node.isArray || node.size() > params.pings) {
            throw InvalidGuessException("rings must be an array of at most ${params.pings} lists")
        }

        // A tip during the afterglow may reach past the wave, so up to twice the field.
        val radii = 0.0..2.0 * params.grid

        return node.mapIndexed { ping, list ->
            if (!list.isArray || list.size() > clipCount) {
                throw InvalidGuessException("rings[$ping] must be an array of at most $clipCount radii")
            }

            list.mapIndexed { i, radius ->
                radius.numberIn(radii) ?: throw InvalidGuessException("rings[$ping][$i] must be a number in $radii")
            }
        }
    }

    /** The number in [range], or `null` — which also turns away NaN and ±Infinity, as no range holds them. */
    private fun JsonNode?.numberIn(range: ClosedFloatingPointRange<Double>): Double? =
        this?.takeIf { it.isNumber }?.asDouble()?.takeIf { it in range }

    private fun JsonNode.hasExactly(vararg fields: String) = isObject && propertyNames().toSet() == fields.toSet()

    companion object {
        /** Frozen with every round, so changing one reaches new rounds only. */
        const val GRID = 20
        const val REACH = 12.0
        const val SPEED = 3.0
        const val PINGS = 3
        const val BED_DB = -24.0
        const val NOISE_DB = 0.0
        const val NOISES = 6
        const val TOLERANCE_CELLS = 1
    }
}
