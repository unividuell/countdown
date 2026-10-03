package org.unividuell.countdown.core.imagepool

import java.awt.image.BufferedImage
import java.util.UUID

/** The size an image is *shown* at — EXIF orientation already applied. */
data class ImageSize(val width: Int, val height: Int)

/**
 * The pool as other modules see it: which images there are, and what one looks like. Read-only,
 * and without a word of game knowledge — which pool a game prefers is the game's rule.
 */
interface ImagePoolQuery {
    /** This pool's image ids in a stable order. `null` addresses the global pool. */
    fun candidateIds(communityId: UUID?): List<UUID>

    /**
     * The shown size, from the file header and its EXIF tag — the stored `width`/`height` are the
     * header's and lie for a rotated phone photo. Reads one image; the pool is never decoded whole.
     */
    fun displaySize(id: UUID): ImageSize?

    /**
     * The image as shown, decoded only as small as [minShortEdge] allows — see
     * `ImageIntake.displayed`. `null` when the image is gone.
     */
    fun displayed(id: UUID, minShortEdge: Int): BufferedImage?
}
