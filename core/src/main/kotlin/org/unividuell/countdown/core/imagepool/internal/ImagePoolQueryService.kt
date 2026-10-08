package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import java.awt.image.BufferedImage
import java.util.UUID

@Service
class ImagePoolQueryService(private val images: ImageRepository) : ImagePoolQuery {

    @Transactional(readOnly = true)
    override fun candidateIds(communityId: UUID?): List<UUID> = images.idsInPool(communityId)

    @Transactional(readOnly = true)
    override fun displaySize(id: UUID): ImageSize? = images.findOriginal(id)?.let {
        val shown = ImageIntake.displayDimensions(bytes = it.bytes, mediaType = it.mediaType)
        ImageSize(width = shown.width, height = shown.height)
    }

    @Transactional(readOnly = true)
    override fun displayed(id: UUID, minShortEdge: Int): BufferedImage? = images.findOriginal(id)?.let {
        ImageIntake.displayed(bytes = it.bytes, mediaType = it.mediaType, minShortEdge = minShortEdge)
    }
}
