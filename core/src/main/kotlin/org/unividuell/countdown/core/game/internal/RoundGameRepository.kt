package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

interface RoundGameRepository : CrudRepository<RoundGame, UUID> {

    fun findByEditionIdAndRoundNumber(editionId: UUID, roundNumber: Int): RoundGame?

    /** Earlier rounds of one game type — the draw's repetition-avoidance input. Derived query. */
    fun findByEditionIdAndGameType(editionId: UUID, gameType: String): List<RoundGame>

    /** Every round of the edition except the one just announced — the rounds that are no longer
     *  playable, and whose stage assets may therefore go. */
    @Query("SELECT id FROM game.round_games WHERE edition_id = :editionId AND round_number <> :roundNumber")
    fun idsOfOtherRounds(editionId: UUID, roundNumber: Int): List<UUID>

    /**
     * The round's row, locked for the rest of the transaction.
     *
     * Needed because scoring writes **other players'** rows: it reads every guess of the round and
     * writes over all of them, so two concurrent guesses would each compute from the same stale
     * picture and one update would be lost — exactly in the moment the points move. Locking one row
     * serialises the guesses of *one* round; different rounds do not block each other, and at fifteen
     * players the cost is not measurable.
     */
    @Query("SELECT * FROM game.round_games WHERE id = :id FOR UPDATE")
    fun findByIdForUpdate(id: UUID): RoundGame?

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
     * The next round of this edition **earlier in time** than [after] — the smallest round number
     * above it, because a larger round number is earlier. [notOlderThan] and [notNewerThan] cap the
     * walk at the run's game window on both sides; older means a larger number, so `gamesFromRound`
     * bounds one side and `gamesUntilRound` the other. Both bounds are needed even though [after]
     * itself may already sit outside the window — e.g. an admin raising `gamesUntilRound` after a
     * round strictly between [after] and the new edge was already announced — otherwise the pointer
     * names a round `HistoryService.resolve`'s own window check then 404s on.
     *
     * `MIN` over an empty set is `NULL`, and that IS „ganz am Anfang" — no second query and no
     * `COUNT` needed to tell the two apart.
     */
    @Query(
        """
        SELECT MIN(round_number) FROM game.round_games
        WHERE edition_id = :editionId AND round_number > :after
            AND round_number <= :notOlderThan AND round_number >= :notNewerThan
        """,
    )
    fun previousRoundNumber(editionId: UUID, after: Int, notOlderThan: Int, notNewerThan: Int): Int?

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
