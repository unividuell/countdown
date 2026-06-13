package org.unividuell.countdown.core.community.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import java.util.UUID

interface CommunityUserSelectionRepository : Repository<CommunityUserSelection, UUID> {
    @Modifying
    @Query(
        """
        INSERT INTO community.community_user_selection (user_id, community_id, updated_at)
        VALUES (:userId, :communityId, now())
        ON CONFLICT (user_id) DO UPDATE SET community_id = :communityId, updated_at = now()
        """
    )
    fun upsert(userId: UUID, communityId: UUID)

    @Query("SELECT community_id FROM community.community_user_selection WHERE user_id = :userId")
    fun findCommunityId(userId: UUID): UUID?
}
