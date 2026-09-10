package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

/** Which pool a request addresses, and whether the caller may see all of it. */
data class PoolContext(val communityId: UUID?, val viewerIsAdmin: Boolean)

/**
 * The tenant gate, owned by this module. CommunityAccess would be shorter but lives in
 * community.internal and is closed to us -- so the resolution goes through the public
 * CommunityQuery/MembershipQuery, exactly as game's AnnouncementService.resolve does.
 *
 * This import also orders imagepool's Flyway migration: Spring Modulith runs a module's
 * migrations after those of the modules its code depends on, so depending on CommunityQuery
 * is what puts imagepool after community (and iam) on a fresh database. Remove it and
 * imagepool's FKs into community.communities/iam.users fail with a missing "community" schema.
 */
@Service
class ImagePoolGate(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
) {
    fun forCommunity(slug: String, userId: UUID, isSuperAdmin: Boolean): PoolContext {
        val community = communities.findBySlug(slug) ?: throw ImagePoolAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (isSuperAdmin) return PoolContext(communityId = communityId, viewerIsAdmin = true)
        if (!memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw ImagePoolAccessDeniedException()
        }
        return PoolContext(
            communityId = communityId,
            viewerIsAdmin = memberships.isAdmin(communityId = communityId, userId = userId),
        )
    }

    /** The global pool has no members: only a super-admin reaches it at all. */
    fun global(isSuperAdmin: Boolean): PoolContext {
        if (!isSuperAdmin) throw ImagePoolAccessDeniedException()
        return PoolContext(communityId = null, viewerIsAdmin = true)
    }
}
