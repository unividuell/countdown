package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.deduster.internal.DedusterProperties
import org.unividuell.countdown.core.imagepool.ImageFit
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.image.BufferedImage
import java.util.UUID

/** A round's photo: cropped to its grid, scaled to the play size, frozen as JPEG. */
@Component
class DedusterImages(
    private val pool: ImagePoolQuery,
    private val properties: DedusterProperties,
) {
    /** `null` when the pool image is gone. */
    fun playImage(imageId: UUID, grid: DedusterGrid): ByteArray? =
        pool.displayed(id = imageId, minShortEdge = properties.playImageEdge)?.let {
            render(
                source = it, grid = grid,
                longEdge = properties.playImageEdge, quality = properties.playImageQuality.toFloat(),
            )
        }

    companion object {
        /** Centre crop to [grid]'s ratio, then down (never up) to [longEdge], as a JPEG at [quality]. */
        fun render(source: BufferedImage, grid: DedusterGrid, longEdge: Int, quality: Float): ByteArray =
            ImageFit.jpeg(
                image = ImageFit.fitted(
                    source = source, ratioWidth = grid.ratioWidth, ratioHeight = grid.ratioHeight, longEdge = longEdge,
                ),
                quality = quality,
            )
    }
}
