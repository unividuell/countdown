package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.playableIds
import java.util.UUID

/** The game's view of the image pool: which images a round may draw, and the grid each one gets. */
@Component
class DedusterPool(private val pool: ImagePoolQuery) {

    fun candidates(communityId: UUID): List<UUID> = pool.playableIds(communityId)

    /** `null` when the image vanished between listing and measuring. */
    fun gridOf(imageId: UUID): DedusterGrid? =
        pool.displaySize(imageId)?.let { DedusterGrid.of(width = it.width, height = it.height) }
}
