package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

interface RoundPlayRepository : CrudRepository<RoundPlay, UUID> {

    fun findByRoundGameIdAndUserId(roundGameId: UUID, userId: UUID): RoundPlay?

    /**
     * Every play of one round, at most as many rows as the community has members.
     *
     * A derived `findBy…` carries **no** `ORDER BY`, so the order is not stable between calls —
     * anything user-visible sorts in code (see persistence.md).
     */
    fun findByRoundGameId(roundGameId: UUID): List<RoundPlay>

    /**
     * Reveal, idempotently: create the row on the first call, count up on every later one.
     *
     * One statement rather than read-then-write, and `DO UPDATE` rather than `DO NOTHING`, because
     * the counter is the point: `revealed_at` stays the first timestamp — it is the round's clock —
     * while `reveal_count` records that somebody looked again. No lockout: Guess Hue has no time
     * scoring, so a refresh buys a trickster nothing, while a lockout would only punish bad wifi.
     *
     * Inside `ON CONFLICT DO UPDATE` the existing row is addressed by the **table name without its
     * schema** (`round_plays.reveal_count`); `game.round_plays.reveal_count` is not a valid
     * reference there.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_plays (round_game_id, user_id, revealed_at)
        VALUES (:roundGameId, :userId, :revealedAt)
        ON CONFLICT (round_game_id, user_id)
            DO UPDATE SET reveal_count = round_plays.reveal_count + 1
        """,
    )
    fun revealOrCount(roundGameId: UUID, userId: UUID, revealedAt: Instant): Int

    /**
     * Record the one guess. **This statement is the rule "one guess per player and round"** — not a
     * check in a service: `WHERE guessed_at IS NULL` makes a second attempt affect zero rows, and
     * zero rows is what the caller turns into a 409.
     *
     * `points` is deliberately not written here. It is a function of *all* verdicts of the round and
     * is written by the re-evaluation that follows, for every guessed row at once.
     */
    @Modifying
    @Query(
        """
        UPDATE game.round_plays
        SET guess = :guess, guessed_at = :guessedAt, qualifies = :qualifies,
            deviation = :deviation, outcome = :outcome
        WHERE id = :id AND guessed_at IS NULL
        """,
    )
    fun recordGuess(
        id: UUID,
        guess: JsonNode,
        guessedAt: Instant,
        qualifies: Boolean,
        deviation: Double,
        outcome: JsonNode?,
    ): Int

    /**
     * Points per player and round for one run — the **input** of a standings sum, not the sum.
     *
     * Grouping and window filtering happen in Kotlin on purpose: whether a round counts is
     * `windowReasonOf`, one predicate shared with the announcement, and duplicating those two
     * comparisons in SQL is exactly how the two would drift apart. The row count is bounded by
     * members × rounds of one run — a few hundred tiny rows.
     *
     * `points IS NOT NULL` is precisely "has guessed": the re-evaluation writes a number for every
     * guessed row of a round, `0` included.
     *
     * `IN (:userIds)` renders `IN ()` for an empty collection, which is a syntax error — the caller
     * guards that.
     */
    @Query(
        """
        SELECT p.user_id AS user_id, g.round_number AS round_number, p.points AS points
        FROM game.round_plays p
        JOIN game.round_games g ON g.id = p.round_game_id
        WHERE g.edition_id = :editionId AND p.points IS NOT NULL AND p.user_id IN (:userIds)
        """,
    )
    fun pointsOf(editionId: UUID, userIds: Collection<UUID>): List<PlayPoints>
}
