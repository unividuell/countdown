package org.unividuell.countdown.core.community

import java.util.UUID

/** Read-only access to communities, for consumption by other modules. */
interface CommunityQuery {
    fun findBySlug(slug: String): Community?
    fun findById(id: UUID): Community?

    /**
     * The community's current run, or `null` if it has none.
     *
     * Nullable on purpose although every community has one: a consumer resolving rounds must be able
     * to answer "not scheduled" rather than blow up, and that decision belongs to the consumer.
     */
    fun activeEditionOf(communityId: UUID): CommunityEdition?
}
