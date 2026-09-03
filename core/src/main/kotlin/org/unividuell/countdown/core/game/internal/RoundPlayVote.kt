package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import org.unividuell.countdown.core.game.Vote
import java.time.Instant
import java.util.UUID

/**
 * One player's judgement of one tip. Written only through [RoundPlayVoteRepository]'s upsert, so
 * the entity exists to name the table rather than to be `save()`d.
 */
@Table(schema = "game", name = "round_play_votes")
data class RoundPlayVote(
    @Id
    val id: UUID? = null,
    val roundPlayId: UUID,
    val voterUserId: UUID,
    val value: Vote,
    val createdAt: Instant,
)

/** One vote, reduced to what a tally and a name list need. */
data class PlayVote(val roundPlayId: UUID, val voterUserId: UUID, val value: Vote)
