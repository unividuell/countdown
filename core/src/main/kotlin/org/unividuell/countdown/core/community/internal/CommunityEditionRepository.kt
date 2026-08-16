package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.CommunityEdition
import java.util.UUID

interface CommunityEditionRepository : CrudRepository<CommunityEdition, UUID> {

    /**
     * Explicit SQL rather than a derived `findByCommunityIdAndArchivedAtIsNull`: this query is the
     * read side of the partial unique index, and spelling it out keeps the two in sight of each
     * other. See persistence.md on derived-query traps.
     */
    @Query("SELECT * FROM community.editions WHERE community_id = :communityId AND archived_at IS NULL")
    fun findActiveByCommunityId(communityId: UUID): CommunityEdition?

    /** For list screens: one query for every community's active edition, never one per row. */
    @Query("SELECT * FROM community.editions WHERE archived_at IS NULL")
    fun findAllActive(): List<CommunityEdition>
}
