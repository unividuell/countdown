package org.unividuell.countdown.core.imagepool

import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.roundToInt

/** Cropping, scaling and encoding a pool photo for play — image knowledge, shared by every image game. */
object ImageFit {

    /** The middle of [source] at exactly [ratioWidth] : [ratioHeight], as large as fits. A view, not a copy. */
    fun centreCrop(source: BufferedImage, ratioWidth: Int, ratioHeight: Int): BufferedImage {
        val wide = source.width.toLong() * ratioHeight > source.height.toLong() * ratioWidth
        val width = if (wide) (source.height.toLong() * ratioWidth / ratioHeight).toInt() else source.width
        val height = if (wide) source.height else (source.width.toLong() * ratioHeight / ratioWidth).toInt()
        return source.getSubimage((source.width - width) / 2, (source.height - height) / 2, width, height)
    }

    /** [source] drawn into exactly [width] × [height], bilinear. */
    fun scaled(source: BufferedImage, width: Int, height: Int): BufferedImage {
        val target = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = target.createGraphics()
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
            graphics.drawImage(source, 0, 0, width, height, null)
        } finally {
            graphics.dispose()
        }
        return target
    }

    /** Centre crop to the ratio, then down — never up — until the long edge is at most [longEdge]. */
    fun fitted(source: BufferedImage, ratioWidth: Int, ratioHeight: Int, longEdge: Int): BufferedImage {
        val crop = centreCrop(source = source, ratioWidth = ratioWidth, ratioHeight = ratioHeight)
        val scale = minOf(a = 1.0, b = longEdge.toDouble() / max(a = crop.width, b = crop.height))
        return scaled(
            source = crop,
            width = max(a = 1, b = (crop.width * scale).roundToInt()),
            height = max(a = 1, b = (crop.height * scale).roundToInt()),
        )
    }

    fun jpeg(image: BufferedImage, quality: Float): ByteArray {
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

    fun png(image: BufferedImage): ByteArray {
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, "png", out)) { "no PNG writer for ${image.type}" }
        return out.toByteArray()
    }

    /** PNG with deflate level 0 (stored): the length is a function of the size and type alone, not of the pixels. */
    fun pngUncompressed(image: BufferedImage): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("png").next()
        val out = ByteArrayOutputStream()
        try {
            ImageIO.createImageOutputStream(out).use { stream ->
                writer.output = stream
                val param = writer.defaultWriteParam.apply {
                    compressionMode = ImageWriteParam.MODE_EXPLICIT
                    // The JDK PNG writer maps quality 1.0 to deflate level 0.
                    compressionQuality = 1.0f
                }
                writer.write(null, IIOImage(image, null, null), param)
            }
        } finally {
            writer.dispose()
        }
        return out.toByteArray()
    }
}
