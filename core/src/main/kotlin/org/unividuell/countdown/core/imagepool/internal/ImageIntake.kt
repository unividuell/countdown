package org.unividuell.countdown.core.imagepool.internal

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import javax.imageio.ImageReader
import kotlin.math.max

sealed interface DetectedFormat {
    data class Supported(val mediaType: String) : DetectedFormat
    /** Recognised on purpose, so the refusal can name it instead of saying "invalid format". */
    data object Heic : DetectedFormat
    data object Unknown : DetectedFormat
}

data class Dimensions(val width: Int, val height: Int) {
    val pixels: Long get() = width.toLong() * height.toLong()
}

/**
 * Everything that happens to an uploaded file before it becomes a row. No Spring, no database --
 * so it can be tested with images the test writes itself.
 */
object ImageIntake {

    /** The client's Content-Type is a claim; these bytes are evidence. */
    fun detect(bytes: ByteArray): DetectedFormat {
        fun at(offset: Int, expected: IntArray): Boolean =
            bytes.size >= offset + expected.size &&
                expected.withIndex().all { (i, b) -> bytes[offset + i].toInt() and 0xFF == b }

        return when {
            at(offset = 0, expected = intArrayOf(0xFF, 0xD8, 0xFF)) -> DetectedFormat.Supported("image/jpeg")
            at(offset = 0, expected = intArrayOf(0x89, 0x50, 0x4E, 0x47)) -> DetectedFormat.Supported("image/png")
            at(offset = 0, expected = intArrayOf(0x47, 0x49, 0x46, 0x38)) -> DetectedFormat.Supported("image/gif")
            // RIFF container: "RIFF" then four length bytes then "WEBP"
            at(offset = 0, expected = intArrayOf(0x52, 0x49, 0x46, 0x46)) &&
                at(offset = 8, expected = intArrayOf(0x57, 0x45, 0x42, 0x50)) ->
                DetectedFormat.Supported("image/webp")
            // ISO-BMFF box: 4 length bytes, then "ftyp", then a brand starting with heic/heix/mif1
            at(offset = 4, expected = intArrayOf(0x66, 0x74, 0x79, 0x70)) && isHeicBrand(bytes) -> DetectedFormat.Heic
            else -> DetectedFormat.Unknown
        }
    }

    private fun isHeicBrand(bytes: ByteArray): Boolean {
        if (bytes.size < 12) return false
        val brand = String(bytes = bytes, offset = 8, length = 4, charset = Charsets.US_ASCII)
        return brand in setOf("heic", "heix", "hevc", "mif1", "msf1", "heim", "heis")
    }

    /** Header only -- a 40 MP file must be measurable without ever becoming a BufferedImage. */
    fun probe(bytes: ByteArray, mediaType: String): Dimensions =
        withReader(bytes = bytes, mediaType = mediaType) {
            Dimensions(width = it.getWidth(0), height = it.getHeight(0))
        }

    /**
     * A JPEG whose long edge is at most [maxEdge], aspect ratio kept, EXIF orientation applied and
     * every other EXIF field dropped (re-encoding writes none).
     *
     * Decoding is subsampled to roughly twice the target first: a 40 MP source would otherwise be
     * ~160 MB of heap for a 400 px result -- 11 % of the container's heap for one upload, and none
     * of it needed. The second, smooth step then does the quality work on a small image.
     */
    fun thumbnail(bytes: ByteArray, mediaType: String, maxEdge: Int): ByteArray {
        val decoded = withReader(bytes = bytes, mediaType = mediaType) { reader ->
            val longEdge = max(a = reader.getWidth(0), b = reader.getHeight(0))
            val step = max(a = 1, b = longEdge / (maxEdge * 2))
            val param = reader.defaultReadParam.apply { setSourceSubsampling(step, step, 0, 0) }
            reader.read(0, param)
        }

        val oriented = applyOrientation(image = decoded, orientation = orientationOf(bytes))
        val scale = minOf(a = 1.0, b = maxEdge.toDouble() / max(a = oriented.width, b = oriented.height))
        val target = if (scale == 1.0) oriented else scaled(
            source = oriented,
            width = max(a = 1, b = Math.round(oriented.width * scale).toInt()),
            height = max(a = 1, b = Math.round(oriented.height * scale).toInt()),
        )

        val out = ByteArrayOutputStream()
        // Flattened onto white: JPEG has no alpha, and a photo pool's PNGs are the exception.
        val opaque = BufferedImage(target.width, target.height, BufferedImage.TYPE_INT_RGB)
        opaque.createGraphics().apply {
            color = java.awt.Color.WHITE
            fillRect(0, 0, target.width, target.height)
            drawImage(target, 0, 0, null)
            dispose()
        }
        ImageIO.write(opaque, "jpeg", out)
        return out.toByteArray()
    }

    private fun <T> withReader(bytes: ByteArray, mediaType: String, block: (ImageReader) -> T): T {
        val readers = ImageIO.getImageReadersByMIMEType(mediaType)
        require(readers.hasNext()) { "no reader for $mediaType" }
        val reader = readers.next()
        return ImageIO.createImageInputStream(ByteArrayInputStream(bytes)).use { input ->
            reader.input = input
            try {
                block(reader)
            } finally {
                reader.dispose()
            }
        }
    }

    /** 1 when absent or unreadable -- a missing tag means "as stored", not an error. */
    private fun orientationOf(bytes: ByteArray): Int = runCatching {
        ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
            .getFirstDirectoryOfType(ExifIFD0Directory::class.java)
            ?.getInt(ExifIFD0Directory.TAG_ORIENTATION)
            ?: 1
    }.getOrDefault(1)

    private fun applyOrientation(image: BufferedImage, orientation: Int): BufferedImage {
        if (orientation == 1) return image
        val w = image.width
        val h = image.height
        val swaps = orientation in setOf(5, 6, 7, 8)
        val transform = AffineTransform().apply {
            when (orientation) {
                2 -> { translate(w.toDouble(), 0.0); scale(-1.0, 1.0) }
                3 -> { translate(w.toDouble(), h.toDouble()); rotate(Math.PI) }
                4 -> { translate(0.0, h.toDouble()); scale(1.0, -1.0) }
                5 -> { rotate(-Math.PI / 2); scale(-1.0, 1.0) }
                6 -> { translate(h.toDouble(), 0.0); rotate(Math.PI / 2) }
                7 -> { scale(-1.0, 1.0); translate(-h.toDouble(), 0.0); rotate(-Math.PI / 2) }
                8 -> { translate(0.0, w.toDouble()); rotate(-Math.PI / 2) }
                else -> return image
            }
        }
        val out = BufferedImage(if (swaps) h else w, if (swaps) w else h, BufferedImage.TYPE_INT_RGB)
        out.createGraphics().apply {
            setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            drawImage(image, transform, null)
            dispose()
        }
        return out
    }

    private fun scaled(source: BufferedImage, width: Int, height: Int): BufferedImage {
        val out = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        out.createGraphics().apply {
            setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
            drawImage(source, 0, 0, width, height, null)
            dispose()
        }
        return out
    }
}
