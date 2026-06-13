package org.unividuell.countdown.core.community.internal

import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.community.Community
import java.util.UUID

interface CommunityRepository : CrudRepository<Community, UUID> {
    fun findBySlug(slug: String): Community?
    fun findByInviteToken(inviteToken: String): Community?
}
