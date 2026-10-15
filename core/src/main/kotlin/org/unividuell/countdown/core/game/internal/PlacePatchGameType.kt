package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
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
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.imagepool.AspectRatio
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.playableIds
import org.unividuell.countdown.core.placepatch.PlacePatchImageStore
import org.unividuell.countdown.core.placepatch.PlacePatchImages
import org.unividuell.countdown.core.placepatch.PlacePatchLayout
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * The frozen round. [x]/[y] — the patch's top-left cell — are the answer and never leave the server
 * as numbers before the guess. [imageId] is a soft reference into the pool and, once the round is
 * announced, only provenance: the round keeps its own copy of the photo.
 *
 * [timed] is how the phase reaches [PlacePatchGameType.requiresReveal], as in Musterung.
 */
data class PlacePatchParams(
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val size: Int,
    val x: Int,
    val y: Int,
    val fraySeed: Int,
    val timed: Boolean,
)

/** What the cover lies over: the board's shape and the patch's size, so the card keeps its height. */
data class PlacePatchScene(val cols: Int, val rows: Int, val size: Int) : GameScene

/** What the player needs to lay out the board. Both pictures come through the round's asset endpoint. */
data class PlacePatchPayload(val cols: Int, val rows: Int, val size: Int) : GamePayload

data class PlacePatchSolution(val x: Int, val y: Int) : GameSolution

/** Hit or not — the whole verdict. */
data class PlacePatchOutcome(val correct: Boolean) : GameOutcome

/**
 * Platzierung as an announceable game; `placepatch` knows nothing about it.
 *
 * The draws are split by publication: the image from the scene stream (its grid is in the scene),
 * the fray seed from the presentation stream (it shows with the patch), the position from the
 * solution stream, x before y.
 */
@Component
class PlacePatchGameType(
    private val pool: ImagePoolQuery,
    private val images: PlacePatchImages,
    private val store: PlacePatchImageStore,
    private val mapper: ObjectMapper,
) : GameType<PlacePatchParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "place-patch"
    override val displayName = "Platzierung"
    override val paramsType = PlacePatchParams::class.java

    override fun isAvailable(context: RoundContext) = pool.playableIds(context.communityId).isNotEmpty()

    override fun draw(random: GameRandom, context: RoundContext): PlacePatchParams {
        val candidates = pool.playableIds(context.communityId)
        val used = context.previousParams.map { mapper.treeToValue(it, PlacePatchParams::class.java).imageId }.toSet()
        // A pool of three images must not starve: once each has had its round, all count again.
        val imageId = random.scene.pick(candidates.filterNot { it in used }.ifEmpty { candidates })
        val shown = checkNotNull(pool.displaySize(imageId)) { "image $imageId vanished between listing and measuring" }
        val layout = PlacePatchLayout.of(aspect = AspectRatio.of(width = shown.width, height = shown.height))
        return PlacePatchParams(
            imageId = imageId,
            cols = layout.cols,
            rows = layout.rows,
            size = layout.size,
            x = random.solution.nextIntBetween(min = 0, maxInclusive = layout.cols - layout.size),
            y = random.solution.nextIntBetween(min = 0, maxInclusive = layout.rows - layout.size),
            fraySeed = random.presentation.nextInt(Int.MAX_VALUE),
            timed = context.phase == Phase.TWO,
        )
    }

    override fun scene(params: PlacePatchParams) =
        PlacePatchScene(cols = params.cols, rows = params.rows, size = params.size)

    override fun present(params: PlacePatchParams) =
        PlacePatchPayload(cols = params.cols, rows = params.rows, size = params.size)

    /** Phase two only, as in Musterung: there the reveal starts the clock, exactly once. */
    override fun requiresReveal(params: PlacePatchParams) = params.timed

    override fun scoresOnDuration(params: PlacePatchParams) = params.timed

    override fun judge(params: PlacePatchParams, guess: JsonNode): Judgement {
        val x = cellOf(guess = guess, field = "x", max = params.cols - params.size)
        val y = cellOf(guess = guess, field = "y", max = params.rows - params.size)
        val correct = x == params.x && y == params.y
        // Hit or miss has no distance. For a timed round the framework replaces this with the duration.
        return Judgement(qualifies = correct, deviation = 0.0, outcome = PlacePatchOutcome(correct = correct))
    }

    override fun solution(params: PlacePatchParams) = PlacePatchSolution(x = params.x, y = params.y)

    override fun assetStage(params: PlacePatchParams, key: Int) =
        if (key == BOARD_KEY || key == PATCH_KEY) 0 else key

    override fun produceAssets(params: PlacePatchParams): Map<Int, RoundAsset> {
        val frozen = images.frozen(imageId = params.imageId, layout = layoutOf(params)) ?: run {
            logger.warn { "place-patch image ${params.imageId} is gone; the round has no photo" }
            return emptyMap()
        }
        return mapOf(BOARD_KEY to board(frozen), PATCH_KEY to patch(params = params, frozen = frozen))
    }

    /** Idempotent: the race's second caller finds the row and freezes nothing a second time. */
    override fun materialised(params: PlacePatchParams, roundGameId: UUID) {
        if (store.find(roundGameId) != null) return
        val frozen = images.frozen(imageId = params.imageId, layout = layoutOf(params)) ?: run {
            logger.warn { "place-patch image ${params.imageId} is gone; round $roundGameId has no photo" }
            return
        }
        store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = frozen)
    }

    override fun asset(params: PlacePatchParams, roundGameId: UUID, key: Int): RoundAsset? {
        if (key != BOARD_KEY && key != PATCH_KEY) return null
        val frozen = store.find(roundGameId)?.bytes ?: return null
        return if (key == BOARD_KEY) board(frozen) else patch(params = params, frozen = frozen)
    }

    // releaseStageAssets stays the no-op default: the history shows past rounds, both pictures included.

    override fun releaseAssets(roundGameIds: List<UUID>) {
        store.release(roundGameIds)
    }

    private fun layoutOf(params: PlacePatchParams) =
        PlacePatchLayout(cols = params.cols, rows = params.rows, size = params.size)

    private fun board(frozen: ByteArray) = RoundAsset(mediaType = "image/jpeg", bytes = PlacePatchImages.board(frozen))

    private fun patch(params: PlacePatchParams, frozen: ByteArray) = RoundAsset(
        mediaType = "image/png",
        bytes = PlacePatchImages.patch(
            frozen = frozen, layout = layoutOf(params), x = params.x, y = params.y, fraySeed = params.fraySeed,
        ),
    )

    private fun cellOf(guess: JsonNode, field: String, max: Int): Int {
        val value = guess.get(field)
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            ?.takeIf { it.isIntegralNumber && it.canConvertToInt() }
            ?.asInt()
            ?: throw InvalidGuessException("guess must carry an integral '$field' in int range")
        if (value !in 0..max) throw InvalidGuessException("$field must lie in [0, $max], was $value")
        return value
    }

    companion object {
        const val BOARD_KEY = 0
        const val PATCH_KEY = 1
    }
}
