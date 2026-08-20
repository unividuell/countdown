package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface RoundAudioRepository : CrudRepository<RoundAudio, UUID> {

    fun findByRoundGameIdAndStage(roundGameId: UUID, stage: Int): RoundAudio?

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO songsnippet.round_audio (round_game_id, stage, media_type, bytes)
        VALUES (:roundGameId, :stage, :mediaType, :bytes)
        ON CONFLICT (round_game_id, stage) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, stage: Int, mediaType: String, bytes: ByteArray): Int

    @Modifying
    @Query("DELETE FROM songsnippet.round_audio WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
