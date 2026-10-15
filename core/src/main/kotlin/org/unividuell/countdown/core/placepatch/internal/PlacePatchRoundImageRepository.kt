package org.unividuell.countdown.core.placepatch.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface PlacePatchRoundImageRepository : CrudRepository<PlacePatchRoundImage, UUID> {

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO placepatch.round_images (round_game_id, media_type, bytes)
        VALUES (:roundGameId, :mediaType, :bytes)
        ON CONFLICT (round_game_id) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, mediaType: String, bytes: ByteArray): Int

    @Query("SELECT media_type, bytes FROM placepatch.round_images WHERE round_game_id = :roundGameId")
    fun findBytes(roundGameId: UUID): PlacePatchRoundImageBytes?

    @Modifying
    @Query("DELETE FROM placepatch.round_images WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
