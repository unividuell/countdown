package org.unividuell.countdown.core.community

import java.util.UUID

/** Read-only access to communities, for consumption by other modules. */
interface CommunityQuery {
    fun findBySlug(slug: String): Community?
    fun findById(id: UUID): Community?
}
