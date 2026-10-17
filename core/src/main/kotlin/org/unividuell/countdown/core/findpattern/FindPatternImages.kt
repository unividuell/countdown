package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.COLS
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PATTERN_LENGTH
import org.unividuell.countdown.core.findpattern.FindPatternLayout.ROWS
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * The board and the sought run as PNGs. This is the game's anti-cheat lever: what the player has to
 * look at never becomes a number in the browser, so the console one-liner that solved the original
 * turns into image processing (see the anti-cheat spec's documented ceiling).
 *
 * They are round assets, not payload fields: the framework seals them, so the browser fetches them
 * under the cover and the reveal only has to open them — nothing loads on phase two's clock.
 */
object FindPatternImages {

    const val BOARD_BLOCK_PX = 24

    /** As wide as the board, so both images fill the same column without either being scaled. */
    const val PATTERN_BLOCK_PX = BOARD_BLOCK_PX * COLS / PATTERN_LENGTH

    fun board(blocks: List<Int>, palette: List<String>): ByteArray =
        png(grid(tones = blocks, palette = palette, cols = COLS, rows = ROWS, scale = BOARD_BLOCK_PX))

    fun pattern(pattern: List<Int>, palette: List<String>): ByteArray =
        png(
            grid(
                tones = pattern, palette = palette,
                cols = PATTERN_LENGTH, rows = 1, scale = PATTERN_BLOCK_PX,
            ),
        )

    private fun grid(
        tones: List<Int>,
        palette: List<String>,
        cols: Int,
        rows: Int,
        scale: Int,
    ): BufferedImage {
        val image = BufferedImage(cols * scale, rows * scale, BufferedImage.TYPE_INT_RGB)
        val canvas = image.createGraphics()
        try {
            for (index in tones.indices) {
                canvas.color = Color.decode(palette[tones[index]])
                canvas.fillRect((index % cols) * scale, (index / cols) * scale, scale, scale)
            }
        } finally {
            canvas.dispose()
        }
        return image
    }

    private fun png(image: BufferedImage): ByteArray {
        // ImageIO's cache defaults to on, which would route this write through a
        // FileCacheImageOutputStream — a temp file per image on a path that has no reason
        // to touch disk, and one that throws outright on a read-only /tmp. `setUseCache` is a
        // per-thread ImageIO setting, not a JVM-wide System property, so this stays this object's
        // own business.
        ImageIO.setUseCache(false)
        val bytes = ByteArrayOutputStream()
        check(ImageIO.write(image, "png", bytes)) { "no PNG writer registered for png" }
        return bytes.toByteArray()
    }
}
