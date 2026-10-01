package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.deduster.internal.DedusterProperties
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.roundToInt

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
        fun render(source: BufferedImage, grid: DedusterGrid, longEdge: Int, quality: Float): ByteArray {
            val wide = source.width.toLong() * grid.ratioHeight > source.height.toLong() * grid.ratioWidth
            val cropWidth = if (wide) source.height * grid.ratioWidth / grid.ratioHeight else source.width
            val cropHeight = if (wide) source.height else source.width * grid.ratioHeight / grid.ratioWidth
            val scale = minOf(a = 1.0, b = longEdge.toDouble() / max(a = cropWidth, b = cropHeight))
            val width = max(a = 1, b = (cropWidth * scale).roundToInt())
            val height = max(a = 1, b = (cropHeight * scale).roundToInt())

            val target = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
            val graphics = target.createGraphics()
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
                graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
                val left = (source.width - cropWidth) / 2
                val top = (source.height - cropHeight) / 2
                graphics.drawImage(source, 0, 0, width, height, left, top, left + cropWidth, top + cropHeight, null)
            } finally {
                graphics.dispose()
            }
            return jpeg(image = target, quality = quality)
        }

        private fun jpeg(image: BufferedImage, quality: Float): ByteArray {
            val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
            val out = ByteArrayOutputStream()
            try {
                ImageIO.createImageOutputStream(out).use { stream ->
                    writer.output = stream
                    val param = writer.defaultWriteParam.apply {
                        compressionMode = ImageWriteParam.MODE_EXPLICIT
                        compressionQuality = quality
                    }
                    writer.write(null, IIOImage(image, null, null), param)
                }
            } finally {
                writer.dispose()
            }
            return out.toByteArray()
        }
    }
}
