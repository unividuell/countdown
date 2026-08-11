package org.unividuell.countdown.core.community

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * One run of a community's countdown: the target date and everything hanging off the round grid.
 *
 * The community itself is permanent, the run is not: the target event recurs (annually, sometimes
 * more often), so `(community, T-58)` is not a key — every run has its own T-58 with its own guesses
 * and its own ranking. Exactly one edition per community is active, enforced by a partial unique
 * index on `archived_at IS NULL`.
 *
 * Exposed rather than internal because `countdown` (and later the game framework) resolves rounds
 * from it. See `docs/superpowers/specs/2026-08-11-round-game-selection-design.md`.
 */
@Table(schema = "community", name = "editions")
data class CommunityEdition(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    /** Display name of the run, e.g. „Hüttenwochenende 2026". */
    val label: String,
    val startsAt: Instant? = null,
    val startsAtTimezone: String = DEFAULT_TIMEZONE,
    val phaseTwoStartRound: Int? = null,
    /**
     * First round that carries a game — the *larger* number, because a larger round number is
     * earlier in time. `null` means "from the very first round".
     */
    val gamesFromRound: Int? = null,
    /** Last round that carries a game — the smaller number. `0` is T-0, the day before the start. */
    val gamesUntilRound: Int = 0,
    /** `null` = active. Archiving is how a run ends; rows are never deleted. */
    val archivedAt: Instant? = null,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
) {
    companion object {
        /** Mirrors the column default in `V3__create_editions.sql`. */
        const val DEFAULT_TIMEZONE = "Europe/Berlin"
    }
}
