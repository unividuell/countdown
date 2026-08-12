package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.time.Instant
import java.util.UUID

/** A community together with its current run — what every read of a community actually needs. */
data class CommunityWithEdition(val community: Community, val edition: CommunityEdition)

@Service
open class CommunityService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
    private val editions: EditionService,
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
        // The first run is labelled with the community name: it is the community's first countdown,
        // and an admin renames it when a second one starts.
        editions.create(communityId = communityId, rawLabel = name)
        return community
    }

    /**
     * The community owns its name, the run owns the schedule. One transaction over both so a
     * rejected timezone cannot leave a renamed community behind — the **rollback** is what
     * guarantees that, not the order of the two writes.
     */
    @Transactional
    open fun update(
        community: Community,
        name: String?,
        label: String?,
        startsAt: Instant?,
        startsAtTimezone: String?,
        phaseTwoStartRound: Int?,
        gamesFromRound: Int?,
        gamesUntilRound: Int?,
    ): CommunityWithEdition {
        name?.let { require(it.trim().length in 3..50) { "name must be 3..50 chars" } }
        val communityId = requireNotNull(community.id)
        val edition = editions.update(
            edition = editions.requireActive(communityId),
            label = label,
            startsAt = startsAt,
            startsAtTimezone = startsAtTimezone,
            phaseTwoStartRound = phaseTwoStartRound,
            gamesFromRound = gamesFromRound,
            gamesUntilRound = gamesUntilRound,
        )
        // slug is immutable — never recomputed
        val saved = communities.save(community.copy(name = name?.trim() ?: community.name))
        return CommunityWithEdition(community = saved, edition = edition)
    }
}
