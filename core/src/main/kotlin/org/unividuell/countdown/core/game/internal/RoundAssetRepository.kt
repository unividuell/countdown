package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface RoundAssetRepository : CrudRepository<RoundAssetRow, UUID> {

    /** First writer wins, the loser is a no-op — both callers of an announce race materialise. */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_assets (round_game_id, name, visibility, stage, media_type, encryption_key, bytes)
        VALUES (:roundGameId, :name, :visibility, :stage, :mediaType, :encryptionKey, :bytes)
        ON CONFLICT (round_game_id, name) DO NOTHING
        """,
    )
    fun insertIfAbsent(
        roundGameId: UUID,
        name: String,
        visibility: String,
        stage: Int?,
        mediaType: String,
        encryptionKey: ByteArray?,
        bytes: ByteArray,
    ): Int

    fun existsByRoundGameId(roundGameId: UUID): Boolean

    fun findByRoundGameIdAndName(roundGameId: UUID, name: String): RoundAssetRow?

    @Query(
        """
        SELECT name, visibility, stage, media_type, encryption_key
        FROM game.round_assets
        WHERE round_game_id = :roundGameId
        """,
    )
    fun findHeaders(roundGameId: UUID): List<RoundAssetHeaderRow>
}
