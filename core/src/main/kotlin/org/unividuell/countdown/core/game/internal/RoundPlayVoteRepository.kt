package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.game.Vote
import java.time.Instant
import java.util.UUID

interface RoundPlayVoteRepository : CrudRepository<RoundPlayVote, UUID> {

    /**
     * Cast or change one vote. `ON CONFLICT DO UPDATE` is what makes the endpoint a `PUT`: a voter
     * holds exactly one ballot per tip, and a second click replaces it instead of stacking.
     *
     * Inside `ON CONFLICT` the existing row is addressed by the table name **without** its schema.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_play_votes (round_play_id, voter_user_id, value, created_at)
        VALUES (:roundPlayId, :voterUserId, :value, :createdAt)
        ON CONFLICT (round_play_id, voter_user_id)
            DO UPDATE SET value = EXCLUDED.value, created_at = EXCLUDED.created_at
        """,
    )
    fun castVote(roundPlayId: UUID, voterUserId: UUID, value: Vote, createdAt: Instant): Int

    /** Take a vote back. Zero rows means there was none — not an error, the end state is the same. */
    @Modifying
    @Query(
        """
        DELETE FROM game.round_play_votes
        WHERE round_play_id = :roundPlayId AND voter_user_id = :voterUserId
        """,
    )
    fun withdrawVote(roundPlayId: UUID, voterUserId: UUID): Int

    /**
     * Every vote of one round — the input of the re-evaluation and of the response, read once.
     *
     * Grouping happens in Kotlin, like `pointsOf`: `VoteTally.of` is the one place the two counts
     * are derived, and duplicating that in SQL is how the two would drift. Bounded by members²
     * per round — a few hundred tiny rows at most.
     */
    @Query(
        """
        SELECT v.round_play_id AS round_play_id, v.voter_user_id AS voter_user_id, v.value AS value
        FROM game.round_play_votes v
        JOIN game.round_plays p ON p.id = v.round_play_id
        WHERE p.round_game_id = :roundGameId
        """,
    )
    fun votesOfRound(roundGameId: UUID): List<PlayVote>
}
