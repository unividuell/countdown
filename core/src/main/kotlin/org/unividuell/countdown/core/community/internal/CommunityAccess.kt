package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

@Service
class CommunityAccess(
    private val communities: CommunityRepository,
    private val membership: MembershipQuery,
) {
    /** Active member (or super-admin) of [slug], else [CommunityAccessDeniedException] (→404). */
    fun requireActiveMember(userId: UUID, isSuperAdmin: Boolean, slug: String): Community {
        val c = communities.findBySlug(slug) ?: throw CommunityAccessDeniedException()
        if (isSuperAdmin || membership.isActiveMember(c.id!!, userId)) return c
        throw CommunityAccessDeniedException()
    }

    /** Admin (or super-admin) of [slug]; 404 if not even a member, 403 if member but not admin. */
    fun requireAdmin(userId: UUID, isSuperAdmin: Boolean, slug: String): Community {
        val c = requireActiveMember(userId, isSuperAdmin, slug)
        if (isSuperAdmin || membership.isAdmin(c.id!!, userId)) return c
        throw NotAdminException()
    }
}
