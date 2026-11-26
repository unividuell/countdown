package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.game.GameWeight
import java.time.Instant
import java.util.UUID

/** One game's stage in one community; only stages other than normal are stored. */
@Table(schema = "game", name = "community_game_weights")
data class CommunityGameWeight(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    val gameType: String,
    val weight: GameWeight,
    @CreatedDate
    val createdAt: Instant? = null,
)

interface CommunityGameWeightRepository : CrudRepository<CommunityGameWeight, UUID> {

    fun findByCommunityId(communityId: UUID): List<CommunityGameWeight>

    @Modifying
    @Query("DELETE FROM game.community_game_weights WHERE community_id = :communityId")
    fun deleteByCommunityId(communityId: UUID): Int
}
