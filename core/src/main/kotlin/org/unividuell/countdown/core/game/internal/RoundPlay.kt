package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import org.unividuell.countdown.core.game.AwardRule
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * One player's involvement in one round: the clock, the guess, the verdict, the points.
 *
 * The row is created on the **first reveal**, not on the guess — the clock has to start when the
 * player sees the round, and a guess without a reveal is not a meaningful request.
 *
 * [qualifies] and [deviation] are the game's verdict and the framework's only comparison values;
 * they never leave the server. [outcome] is the game-shaped version the player is told, [points] the
 * cache the standings sum over. All four are `null` until there is a guess.
 *
 * No `@CreatedDate` on [revealedAt]: both writes are custom SQL (see [RoundPlayRepository]) and
 * Spring Data auditing only runs for `save()`. The caller stamps from the `Clock` bean.
 */
@Table(schema = "game", name = "round_plays")
data class RoundPlay(
    @Id
    val id: UUID? = null,
    val roundGameId: UUID,
    val userId: UUID,
    val revealedAt: Instant,
    val revealCount: Int = 1,
    /** Staged progression, 0-based. Advanced by skip or (phase one) a wrong non-terminal guess. */
    val stage: Int = 0,
    val guess: JsonNode? = null,
    val guessedAt: Instant? = null,
    val qualifies: Boolean? = null,
    val deviation: Double? = null,
    val outcome: JsonNode? = null,
    val points: Int? = null,
)

/** One scored guess, reduced to what a standings sum needs: whose, which round, how much. */
data class PlayPoints(
    val userId: UUID,
    val roundNumber: Int,
    val points: Int,
    /** The round's own, frozen at announcement — not what `awardFor` would say about it today. */
    val awardRule: AwardRule,
)
