package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.COLS
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PATTERN_LENGTH
import org.unividuell.countdown.core.findpattern.FindPatternLayout.ROWS
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO

/**
 * The board and the sought run as PNGs. This is the game's anti-cheat lever: what the player has to
 * look at never becomes a number in the browser, so the console one-liner that solved the original
 * turns into image processing (see the anti-cheat spec's documented ceiling).
 *
 * They travel inside the payload as `data:` URIs rather than through the round's asset endpoint:
 * two flat images of a few hundred bytes need no storage, no migration and no release hook, and the
 * endpoint's pre-guess gate admits exactly one key for a single-stage game. Rendered per response
 * — a millisecond — instead of frozen into the params, which keeps the round's secret free of its
 * own presentation.
 */
object FindPatternImages {

    const val BOARD_BLOCK_PX = 24

    /** As wide as the board, so both images fill the same column without either being scaled. */
    const val PATTERN_BLOCK_PX = BOARD_BLOCK_PX * COLS / PATTERN_LENGTH

    fun board(blocks: List<Int>, palette: List<String>): String =
        dataUri(grid(tones = blocks, palette = palette, cols = COLS, rows = ROWS, scale = BOARD_BLOCK_PX))

    fun pattern(pattern: List<Int>, palette: List<String>): String =
        dataUri(
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

    private fun dataUri(image: BufferedImage): String {
        val bytes = ByteArrayOutputStream()
        ImageIO.write(image, "png", bytes)
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes.toByteArray())
    }
}
