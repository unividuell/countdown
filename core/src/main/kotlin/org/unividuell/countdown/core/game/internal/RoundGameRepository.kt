package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

interface RoundGameRepository : CrudRepository<RoundGame, UUID> {

    fun findByEditionIdAndRoundNumber(editionId: UUID, roundNumber: Int): RoundGame?

    /**
     * The rounds of this edition that lie **earlier in time** than [after] — a larger round number is
     * earlier, so that is `round_number > :after`, ascending, which puts the most recently played
     * round first.
     *
     * Returns the whole history rather than just the previous round: the selection rule is meant to
     * grow ("not within the last three", even distribution), and giving it everything means the next
     * rule is a change to a pure function instead of to this query. Bounded by the rounds of one
     * edition — some dozens of two-column rows.
     */
    @Query(
        """
        SELECT round_number, game_type FROM game.round_games
        WHERE edition_id = :editionId AND round_number > :after
        ORDER BY round_number ASC
        """,
    )
    fun historyOf(editionId: UUID, after: Int): List<PastRound>

    /**
     * First writer wins, and the loser gets no exception.
     *
     * `ON CONFLICT DO NOTHING` rather than catching `DuplicateKeyException`: a constraint violation
     * marks the transaction rollback-only in Postgres, so the re-read that follows would fail inside
     * the same transaction. One statement without an error state avoids the whole subject.
     *
     * Returns the number of rows inserted — 0 means somebody else announced this round first.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_games
            (edition_id, round_number, game_type, params, award_rule, award_points, announced_at)
        VALUES (:editionId, :roundNumber, :gameType, :params, :awardRule, :awardPoints, :announcedAt)
        ON CONFLICT (edition_id, round_number) DO NOTHING
        """,
    )
    fun insertIfAbsent(
        editionId: UUID,
        roundNumber: Int,
        gameType: String,
        params: JsonNode,
        awardRule: String,
        awardPoints: Int,
        announcedAt: Instant,
    ): Int
}
