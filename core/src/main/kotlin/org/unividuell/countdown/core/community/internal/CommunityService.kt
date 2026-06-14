package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.time.Instant
import java.time.ZoneId
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
        if (Slugs.isReserved(slug)) throw SlugUnavailableException("slug '$slug' is reserved")
        if (communities.findBySlug(slug) != null) throw SlugUnavailableException("slug '$slug' is taken")
        val community = try {
            communities.save(Community(name = name, slug = slug, createdBy = creatorUserId))
        } catch (e: DuplicateKeyException) {
            throw SlugUnavailableException("slug '$slug' is taken")
        }
        members.save(
            CommunityMember(
                communityId = community.id!!,
                userId = creatorUserId,
                status = MemberStatus.ACTIVE,
                isAdmin = true,
            )
        )
        return community
    }

    @Transactional
    open fun update(community: Community, name: String?, startsAt: Instant?, startsAtTimezone: String?, phaseTwoStartRound: Int?): Community {
        name?.let { require(it.trim().length in 3..50) { "name must be 3..50 chars" } }
        phaseTwoStartRound?.let { require(it > 0) { "phaseTwoStartRound must be > 0" } }
        // IANA region IDs only (by design): DST-correct round math needs region zones, not fixed offsets.
        startsAtTimezone?.let { require(ZoneId.getAvailableZoneIds().contains(it)) { "invalid timezone: $it" } }
        // slug is immutable — never recomputed
        return communities.save(
            community.copy(
                name = name?.trim() ?: community.name,
                startsAt = startsAt ?: community.startsAt,
                startsAtTimezone = startsAtTimezone ?: community.startsAtTimezone,
                phaseTwoStartRound = phaseTwoStartRound ?: community.phaseTwoStartRound,
                updatedAt = Instant.now(),
            )
        )
    }
}
