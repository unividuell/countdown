package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterImages
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.deduster.DedusterTicks
import org.unividuell.countdown.core.deduster.RoundImageStore
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameScene
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.SCENE_ASSET_KEY
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * The frozen round. [imageId] is a soft reference into the pool and, once the round is announced,
 * only provenance — the round keeps its own copy of the photo.
 */
data class DedusterParams(
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val intervalMs: Int,
    /** The order tiles are dusted off in: a permutation of `0 until cols * rows`. */
    val order: List<Int>,
)

/** What lies under the cover: the dusted grid, and the tempo the hold counts in at. */
data class DedusterScene(val cols: Int, val rows: Int, val intervalMs: Int) : GameScene

/**
 * What the run needs, from the reveal on. No `imageId`: the photo comes through the round's asset
 * endpoint, and a pool id here would be a second, ungated address for the same picture.
 */
data class DedusterPayload(val cols: Int, val rows: Int, val intervalMs: Int, val order: List<Int>) : GamePayload

enum class DedusterEnd { COMPLETE, TOO_LATE, WRONG_TILE }

/** The guess as stored — rebuilt from the checked fields, never the client's node. */
data class DedusterGuess(
    /** One reaction per tile hit in time, in tick order. Its size IS how far the run got. */
    val reactionsMs: List<Int>,
    val endedBy: DedusterEnd,
    /** Only for [DedusterEnd.WRONG_TILE], and only when usable: for the evaluation, never the verdict. */
    val wrongTileIndex: Int?,
    /** The wrong tap's time since the last tile fell, for the curve's last point; same rule as above. */
    val wrongReactionMs: Int?,
    /** The run began after a reload. */
    val restarted: Boolean,
)

data class DedusterOutcome(
    val tilesCleared: Int,
    val endedBy: DedusterEnd,
    val wrongTileIndex: Int?,
    /** `null` for a run without a single hit, so the table can say „—“. */
    val averageReactionMs: Double?,
    /** A reaction below [MIN_HUMAN_MS] or above the beat. Marked, still stored and scored. */
    val implausible: Boolean,
    val restarted: Boolean,
) : GameOutcome

/** Below this, a tap was already on its way before the tile fell. */
private const val MIN_HUMAN_MS = 120

/**
 * Entstauber as an announceable game; `deduster` knows nothing about it.
 *
 * The draw order is part of the round's identity: image, then tempo from the scene stream — both
 * reach the client before the reveal — then the tile order from the presentation stream, which
 * only arrives with the payload. The solution stream stays untouched on purpose: there is nothing
 * to hide here that is not on the screen anyway. Do not "repair" that.
 */
@Component
class DedusterGameType(
    private val pool: DedusterPool,
    private val images: DedusterImages,
    private val store: RoundImageStore,
    private val mapper: ObjectMapper,
) : GameType<DedusterParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "deduster"
    override val displayName = "Entstauber"
    override val paramsType = DedusterParams::class.java

    override fun isAvailable(context: RoundContext) = pool.candidates(context.communityId).isNotEmpty()

    override fun draw(random: GameRandom, context: RoundContext): DedusterParams {
        val candidates = pool.candidates(context.communityId)
        val used = context.previousParams.map { mapper.treeToValue(it, DedusterParams::class.java).imageId }.toSet()
        // A pool of three images must not starve: once each has had its round, all count again.
        val imageId = random.scene.pick(candidates.filterNot { it in used }.ifEmpty { candidates })
        val grid = checkNotNull(pool.gridOf(imageId)) { "image $imageId vanished between listing and measuring" }
        val intervalMs = DedusterTicks.intervalMs(random.scene)
        return DedusterParams(
            imageId = imageId,
            cols = grid.cols,
            rows = grid.rows,
            intervalMs = intervalMs,
            order = random.presentation.shuffled((0 until grid.tiles).toList()),
        )
    }

    override fun scene(params: DedusterParams) =
        DedusterScene(cols = params.cols, rows = params.rows, intervalMs = params.intervalMs)

    override fun present(params: DedusterParams) = DedusterPayload(
        cols = params.cols, rows = params.rows, intervalMs = params.intervalMs, order = params.order,
    )

    override fun requiresReveal(params: DedusterParams) = true

    /** The reveal-to-guess span is idle time plus a fixed number of beats — the same for every finisher. */
    override fun scoresOnDuration(params: DedusterParams) = false

    override fun judge(params: DedusterParams, guess: JsonNode): Judgement {
        val tiles = params.cols * params.rows
        val reactions = reactionsOf(node = guess.get("reactionsMs"), tiles = tiles)
        val endedBy = endOf(guess.get("endedBy"))
        if (endedBy == DedusterEnd.COMPLETE && reactions.size != tiles) {
            throw InvalidGuessException("a complete run has $tiles reactions, got ${reactions.size}")
        }
        if (endedBy != DedusterEnd.COMPLETE && reactions.size == tiles) {
            throw InvalidGuessException("a run with every tile hit is complete, not $endedBy")
        }
        val restarted = when (val node = guess.get("restarted")) {
            null -> false
            else -> if (node.isBoolean) node.asBoolean() else throw InvalidGuessException("restarted must be a boolean")
        }
        val wrongTileIndex = wrongTileOf(params = params, endedBy = endedBy, level = reactions.size, node = guess.get("wrongTileIndex"))
        val wrongReactionMs = wrongReactionOf(params = params, endedBy = endedBy, node = guess.get("wrongReactionMs"))

        val implausible = reactions.any { it < MIN_HUMAN_MS || it > params.intervalMs }
        if (implausible) {
            // The row carries the mark and the player; this line is what makes it findable in the log.
            logger.warn {
                "deduster run on image ${params.imageId} marked implausible: a reaction outside " +
                    "$MIN_HUMAN_MS..${params.intervalMs} ms"
            }
        }
        val average = reactions.takeIf { it.isNotEmpty() }?.average()

        return Judgement(
            qualifies = endedBy == DedusterEnd.COMPLETE,
            // The worst real value, not a sentinel: zero would read as perfect.
            deviation = average ?: params.intervalMs.toDouble(),
            guess = mapper.valueToTree(
                DedusterGuess(
                    reactionsMs = reactions, endedBy = endedBy,
                    wrongTileIndex = wrongTileIndex, wrongReactionMs = wrongReactionMs, restarted = restarted,
                ),
            ),
            outcome = DedusterOutcome(
                tilesCleared = reactions.size,
                endedBy = endedBy,
                wrongTileIndex = wrongTileIndex,
                averageReactionMs = average,
                implausible = implausible,
                restarted = restarted,
            ),
        )
    }

    override fun produceAssets(params: DedusterParams): Map<Int, RoundAsset> {
        val grid = DedusterGrid.ofLayout(cols = params.cols, rows = params.rows)
        val bytes = images.playImage(imageId = params.imageId, grid = grid) ?: run {
            logger.warn { "deduster image ${params.imageId} is gone; the round has no photo" }
            return emptyMap()
        }
        return mapOf(SCENE_ASSET_KEY to RoundAsset(mediaType = "image/jpeg", bytes = bytes))
    }

    /** Idempotent: the race's second caller finds the row and does not render a second time. */
    override fun materialised(params: DedusterParams, roundGameId: UUID) {
        if (store.find(roundGameId) != null) return
        val asset = produceAssets(params)[SCENE_ASSET_KEY] ?: return
        store.store(roundGameId = roundGameId, mediaType = asset.mediaType, bytes = asset.bytes)
    }

    override fun asset(params: DedusterParams, roundGameId: UUID, key: Int): RoundAsset? =
        if (key != SCENE_ASSET_KEY) null
        else store.find(roundGameId)?.let { RoundAsset(mediaType = it.mediaType, bytes = it.bytes) }

    // releaseStageAssets stays the no-op default: the history shows past rounds, photo included.

    override fun releaseAssets(roundGameIds: List<UUID>) {
        store.release(roundGameIds)
    }

    private fun reactionsOf(node: JsonNode?, tiles: Int): List<Int> {
        if (node == null || !node.isArray) throw InvalidGuessException("reactionsMs must be an array")
        if (node.size() > tiles) throw InvalidGuessException("more reactions than the grid's $tiles tiles")
        // toList(): JsonNode has its own single-value `map`, which would shadow the Iterable one.
        return node.toList().map { entry ->
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            if (!entry.isIntegralNumber || !entry.canConvertToInt() || entry.asInt() < 0) {
                throw InvalidGuessException("every reaction must be a non-negative integer of milliseconds")
            }
            entry.asInt()
        }
    }

    private fun endOf(node: JsonNode?): DedusterEnd {
        val name = node?.takeIf { it.isString }?.asString()
        return DedusterEnd.entries.firstOrNull { it.name == name }
            ?: throw InvalidGuessException("endedBy must be one of ${DedusterEnd.entries}")
    }

    /**
     * Decoration, not verdict: a missing, out-of-range or — of all tiles — the right one is dropped
     * with a warning, and the evaluation draws no wrong tile for the run.
     */
    private fun wrongTileOf(params: DedusterParams, endedBy: DedusterEnd, level: Int, node: JsonNode?): Int? {
        if (endedBy != DedusterEnd.WRONG_TILE) return null
        val index = node?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.asInt()
        if (index == null || index !in params.order.indices || index == params.order[level]) {
            logger.warn { "deduster run on image ${params.imageId}: unusable wrongTileIndex $node dropped" }
            return null
        }
        return index
    }

    /** Decoration like [wrongTileOf]: anything but a time inside the beat is dropped without a word. */
    private fun wrongReactionOf(params: DedusterParams, endedBy: DedusterEnd, node: JsonNode?): Int? {
        if (endedBy != DedusterEnd.WRONG_TILE) return null
        return node?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.asInt()?.takeIf { it in 0..params.intervalMs }
    }
}
