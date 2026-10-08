package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.util.UUID

/** The game's view of the image pool. The precedence lives here, not in the pool: the pool knows no games. */
@Component
class DedusterPool(private val pool: ImagePoolQuery) {

    /** The community's own images; the global ones only when it has none. */
    fun candidates(communityId: UUID): List<UUID> =
        pool.candidateIds(communityId).ifEmpty { pool.candidateIds(null) }

    /** `null` when the image vanished between listing and measuring. */
    fun gridOf(imageId: UUID): DedusterGrid? =
        pool.displaySize(imageId)?.let { DedusterGrid.of(width = it.width, height = it.height) }
}
