package org.unividuell.countdown.core.placepatch

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.imagepool.ImageFit
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.image.BufferedImage
import java.awt.image.DataBufferByte
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.math.cbrt
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * A round's photo frozen for play, and the two pictures the player is shown — both derived from
 * it on every request, a pure function of the frozen bytes and the round's params.
 */
@Component
class PlacePatchImages(private val pool: ImagePoolQuery) {

    /** The pool photo cropped and scaled for [layout]; `null` when the pool image is gone. */
    fun frozen(imageId: UUID, layout: PlacePatchLayout): ByteArray? =
        pool.displayed(id = imageId, minShortEdge = min(a = layout.cols, b = layout.rows) * PlacePatchLayout.MAX_CELL_PX)
            ?.let { freeze(source = it, layout = layout) }

    companion object {
        private const val QUALITY = 0.82f

        /** sRGB byte → linear light, once. */
        private val LINEAR = DoubleArray(256) {
            val c = it / 255.0
            if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }

        private const val ENCODE_STEPS = 4095

        /**
         * Linear Y in [0, 1] → sRGB grey byte, in [ENCODE_STEPS] steps: a `pow` per pixel is what a
         * 1M-pixel board cannot afford. Off the exact curve by at most one level; 0 → 0, 1 → 255.
         */
        private val ENCODED = IntArray(ENCODE_STEPS + 1) {
            val y = it.toDouble() / ENCODE_STEPS
            val encoded = if (y <= 0.0031308) 12.92 * y else 1.055 * y.pow(1 / 2.4) - 0.055
            (255 * encoded).roundToInt().coerceIn(minimumValue = 0, maximumValue = 255)
        }

        /** Centre crop to exactly cols : rows, scaled to whole square cells. */
        fun freeze(source: BufferedImage, layout: PlacePatchLayout): ByteArray {
            val crop = ImageFit.centreCrop(source = source, ratioWidth = layout.cols, ratioHeight = layout.rows)
            val cell = layout.cellPx(cropWidth = crop.width)
            return ImageFit.jpeg(
                image = ImageFit.scaled(source = crop, width = layout.cols * cell, height = layout.rows * cell),
                quality = QUALITY,
            )
        }

        /** The board: the frozen photo in neutral grey of the same OKLab lightness, single-channel. */
        fun board(frozen: ByteArray): ByteArray {
            val photo = decode(frozen)
            val grey = BufferedImage(photo.width, photo.height, BufferedImage.TYPE_BYTE_GRAY)
            val pixels = photo.getRGB(0, 0, photo.width, photo.height, null, 0, photo.width)
            val samples = (grey.raster.dataBuffer as DataBufferByte).data
            for (i in pixels.indices) samples[i] = greyOf(pixels[i]).toByte()
            return ImageFit.jpeg(image = grey, quality = QUALITY)
        }

        /**
         * The patch: `layout.size` cells from ([x], [y]), in colour, its border frayed by [fraySeed].
         * Encoded uncompressed: the ciphertext reaches the client before the reveal, so its size must
         * not follow the texture at the solution.
         */
        fun patch(frozen: ByteArray, layout: PlacePatchLayout, x: Int, y: Int, fraySeed: Int): ByteArray {
            val photo = decode(frozen)
            val cell = photo.width / layout.cols
            val side = layout.size * cell
            val alpha = FrayMask.alpha(width = side, height = side, depth = FrayMask.DEPTH * side, seed = fraySeed)
            val out = BufferedImage(side, side, BufferedImage.TYPE_INT_ARGB)
            for (py in 0 until side) {
                for (px in 0 until side) {
                    val a = (alpha[py * side + px] * 255).roundToInt()
                    // Fully frayed pixels carry no colour: a client that ignores alpha must not see the square.
                    val rgb = if (a == 0) 0 else photo.getRGB(x * cell + px, y * cell + py) and 0xFFFFFF
                    out.setRGB(px, py, (a shl 24) or rgb)
                }
            }
            return ImageFit.pngUncompressed(out)
        }

        private fun decode(bytes: ByteArray): BufferedImage =
            checkNotNull(ImageIO.read(ByteArrayInputStream(bytes))) { "frozen photo does not decode" }

        /**
         * The grey of the same OKLab lightness: two colours the eye calls equally light become one
         * grey, which is what makes the patch's colour the information. Linear Y = L³ for a grey.
         */
        private fun greyOf(rgb: Int): Int {
            val r = LINEAR[(rgb shr 16) and 0xFF]
            val g = LINEAR[(rgb shr 8) and 0xFF]
            val b = LINEAR[rgb and 0xFF]
            val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
            val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
            val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
            val lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
            val grey = lightness.coerceIn(minimumValue = 0.0, maximumValue = 1.0)
            return ENCODED[(grey * grey * grey * ENCODE_STEPS + 0.5).toInt()]
        }
    }
}
