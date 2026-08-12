package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * A round's announcement, frozen. Once this row exists, the round's game, its content and its stake
 * never change again — that is the whole point of writing it down rather than deriving it: the
 * catalogue is code, and a newly deployed game type must not rewrite a round somebody already played.
 *
 * [params] is the game's own opaque blob and **contains the solution**. It leaves the server only
 * through `GameType.present` (and, from Plan 3 on, `solution`), never as a field. Held as a
 * [JsonNode] rather than a `String` so the `JsonNode ↔ PGobject` converter has a type of its own to
 * hang on — a `String` converter would apply to every text column in every entity.
 *
 * No `@CreatedDate` on [announcedAt]: the insert is custom SQL (see
 * [RoundGameRepository.insertIfAbsent]) and Spring Data auditing only runs for `save()`. The caller
 * stamps it from the `Clock` bean.
 */
@Table(schema = "game", name = "round_games")
data class RoundGame(
    @Id
    val id: UUID? = null,
    val editionId: UUID,
    val roundNumber: Int,
    val gameType: String,
    val params: JsonNode,
    val awardRule: AwardRule,
    val awardPoints: Int,
    val announcedAt: Instant,
)

/** A round that already happened, as much of it as the selection rule is allowed to see. */
data class PastRound(val roundNumber: Int, val gameType: String)
