package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
open class SelectionService(private val selection: CommunityUserSelectionRepository) {
    @Transactional
    open fun set(userId: UUID, communityId: UUID) = selection.upsert(userId, communityId)

    @Transactional(readOnly = true)
    open fun get(userId: UUID): UUID? = selection.findCommunityId(userId)
}
