package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.game.AssetHeader
import org.unividuell.countdown.core.game.AssetVisibility
import org.unividuell.countdown.core.game.StoredAsset
import java.util.UUID

private const val SCENE = "SCENE"
private const val STAGE = "STAGE"
private const val AFTER_GUESS = "AFTER_GUESS"

/**
 * The frozen assets of a round, in the terms the module thinks in: [StoredAsset] and
 * [AssetVisibility]. Written once at materialisation, never changed, never released.
 */
@Component
class RoundAssetStore(private val repository: RoundAssetRepository) {

    /** Keeps what is already there, per name: a racing second writer must not replace the first one's keys. */
    @Transactional
    fun storeAll(roundGameId: UUID, assets: List<StoredAsset>) {
        assets.forEach { asset ->
            val visibility = asset.header.visibility
            repository.insertIfAbsent(
                roundGameId = roundGameId,
                name = asset.header.name,
                visibility = visibility.column(),
                stage = (visibility as? AssetVisibility.FromStage)?.stage,
                mediaType = asset.header.mediaType,
                encryptionKey = asset.header.key,
                bytes = asset.bytes,
            )
        }
    }

    @Transactional(readOnly = true)
    fun exists(roundGameId: UUID): Boolean = repository.existsByRoundGameId(roundGameId)

    /** Never reads a byte: the keys of a round are worth a cheap read, its payload is not. */
    @Transactional(readOnly = true)
    fun headers(roundGameId: UUID): List<AssetHeader> =
        repository.findHeaders(roundGameId).map { row ->
            headerOf(
                name = row.name, visibility = row.visibility, stage = row.stage,
                mediaType = row.mediaType, key = row.encryptionKey,
            )
        }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID, name: String): StoredAsset? =
        repository.findByRoundGameIdAndName(roundGameId = roundGameId, name = name)?.let { row ->
            StoredAsset(
                header = headerOf(
                    name = row.name, visibility = row.visibility, stage = row.stage,
                    mediaType = row.mediaType, key = row.encryptionKey,
                ),
                bytes = row.bytes,
            )
        }

    private fun headerOf(name: String, visibility: String, stage: Int?, mediaType: String, key: ByteArray?) =
        AssetHeader(
            name = name,
            visibility = visibilityOf(column = visibility, stage = stage),
            mediaType = mediaType,
            key = key,
        )

    private fun AssetVisibility.column(): String = when (this) {
        AssetVisibility.Scene -> SCENE
        is AssetVisibility.FromStage -> STAGE
        AssetVisibility.AfterGuess -> AFTER_GUESS
    }

    private fun visibilityOf(column: String, stage: Int?): AssetVisibility = when (column) {
        SCENE -> AssetVisibility.Scene
        STAGE -> AssetVisibility.FromStage(requireNotNull(stage) { "a STAGE asset without a stage" })
        AFTER_GUESS -> AssetVisibility.AfterGuess
        else -> error("unknown asset visibility: $column")
    }
}
