package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.InviteQuery
import org.unividuell.countdown.core.countdown.CountdownQuery
import java.time.Clock
import java.util.UUID

/**
 * Resolves a shared path into the preview a messenger gets. Anything that does not resolve —
 * unknown slug, unknown or expired code — answers with the generic page, byte for byte, so the
 * preview cannot be used to find out what exists.
 */
@Service
@Transactional(readOnly = true)
class PreviewService(
    private val communities: CommunityQuery,
    private val invites: InviteQuery,
    private val countdown: CountdownQuery,
    private val clock: Clock,
) {

    fun forCommunity(slug: String): PreviewPage {
        val community = communities.findBySlug(slug) ?: return PreviewPage.generic()
        return PreviewPage(
            title = community.name,
            description = describe(communityId = requireNotNull(community.id), lead = null),
            path = "/c/${community.slug}",
        )
    }

    fun forInvite(code: String): PreviewPage {
        val community = invites.communityOfValidInvite(code) ?: return PreviewPage.generic()
        return PreviewPage(
            title = community.name,
            description = describe(communityId = requireNotNull(community.id), lead = "Du bist eingeladen"),
            path = "/join/$code",
        )
    }

    /** A negative round number is at or past the start: there is nothing left to count down. */
    private fun describe(communityId: UUID, lead: String?): String {
        val round = countdown.currentRound(communityId = communityId, now = clock.instant())
        val tail = if (round != null && round.number >= 0) "${round.label}: Spiel mit!" else "Spiel mit!"
        return if (lead == null) tail else "$lead — $tail"
    }
}
