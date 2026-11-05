package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.util.UUID

@Service
open class CommunityService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) {
    @Transactional
    open fun create(creatorUserId: UUID, rawName: String): Community {
        val name = rawName.trim()
        require(name.length in 3..50) { "name must be 3..50 chars" }
        val slug = Slugs.slugify(name)
        require(slug.length >= 3) { "derived slug must be at least 3 chars" }
        if (communities.findBySlug(slug) != null) throw SlugUnavailableException("slug '$slug' is taken")
        val community = try {
            communities.save(Community(name = name, slug = slug, createdBy = creatorUserId))
        } catch (e: DuplicateKeyException) {
            throw SlugUnavailableException("slug '$slug' is taken")
        }
        val communityId = requireNotNull(community.id)
        members.save(
            CommunityMember(
                communityId = communityId,
                userId = creatorUserId,
                status = MemberStatus.ACTIVE,
                isAdmin = true,
            )
        )
        return community
    }

    @Transactional
    open fun rename(community: Community, name: String): Community {
        require(name.trim().length in 3..50) { "name must be 3..50 chars" }
        // slug is immutable — never recomputed
        return communities.save(community.copy(name = name.trim()))
    }
}
