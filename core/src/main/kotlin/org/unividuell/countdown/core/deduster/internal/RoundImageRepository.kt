package org.unividuell.countdown.core.deduster.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface RoundImageRepository : CrudRepository<RoundImage, UUID> {

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO deduster.round_images (round_game_id, media_type, bytes)
        VALUES (:roundGameId, :mediaType, :bytes)
        ON CONFLICT (round_game_id) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, mediaType: String, bytes: ByteArray): Int

    @Query("SELECT media_type, bytes FROM deduster.round_images WHERE round_game_id = :roundGameId")
    fun findBytes(roundGameId: UUID): RoundImageBytes?

    @Modifying
    @Query("DELETE FROM deduster.round_images WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
