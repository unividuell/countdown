package org.unividuell.countdown.core.audiopool.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

/**
 * The tenant gate, owned by this module. CommunityAccess would be shorter but lives in
 * community.internal and is closed to us -- so the resolution goes through the public
 * CommunityQuery/MembershipQuery, exactly as imagepool's ImagePoolGate does.
 *
 * This import also orders audiopool's Flyway migration: Spring Modulith runs a module's
 * migrations after those of the modules its code depends on, so depending on CommunityQuery
 * is what puts audiopool after community (and iam) on a fresh database. Remove it and
 * audiopool's FKs into community.communities/iam.users fail with a missing "community" schema.
 */
@Service
class AudioPoolGate(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
) {
    fun forCommunity(slug: String, userId: UUID, isSuperAdmin: Boolean): AudioPoolContext {
        val community = communities.findBySlug(slug) ?: throw AudioPoolAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (isSuperAdmin) return AudioPoolContext(communityId = communityId, viewerIsAdmin = true)
        if (!memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw AudioPoolAccessDeniedException()
        }
        return AudioPoolContext(
            communityId = communityId,
            viewerIsAdmin = memberships.isAdmin(communityId = communityId, userId = userId),
        )
    }

    /** The global pool has no members: only a super-admin reaches it at all. */
    fun global(isSuperAdmin: Boolean): AudioPoolContext {
        if (!isSuperAdmin) throw AudioPoolAccessDeniedException()
        return AudioPoolContext(communityId = null, viewerIsAdmin = true)
    }
}
