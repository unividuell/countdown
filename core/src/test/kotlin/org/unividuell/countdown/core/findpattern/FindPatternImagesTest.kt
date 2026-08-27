package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldStartWith
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.util.Base64
import javax.imageio.ImageIO

class FindPatternImagesTest {

    private val palette = listOf("#ffffff", "#c0c0c0", "#808080", "#000000")
    private val blocks = List(FindPatternLayout.BLOCK_COUNT) { it % FindPatternLayout.PALETTE_SIZE }

    private fun decode(dataUri: String) = ImageIO.read(
        ByteArrayInputStream(Base64.getDecoder().decode(dataUri.substringAfter(","))),
    )

    @Test
    fun `the board is one image per block at the board scale`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))

        image.width shouldBe FindPatternLayout.COLS * FindPatternImages.BOARD_BLOCK_PX
        image.height shouldBe FindPatternLayout.ROWS * FindPatternImages.BOARD_BLOCK_PX
    }

    @Test
    fun `it is a PNG data uri`() {
        FindPatternImages.board(blocks = blocks, palette = palette) shouldStartWith
            "data:image/png;base64,"
    }

    /** The pattern is as wide as the board, with blocks twice the size — the original's proportion. */
    @Test
    fun `the pattern image matches the board width`() {
        val board = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val image = decode(FindPatternImages.pattern(pattern = listOf(0, 1, 2, 3), palette = palette))

        image.width shouldBe board.width
        image.height shouldBe FindPatternImages.PATTERN_BLOCK_PX
    }

    @Test
    fun `a cell carries the colour its block index names`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val scale = FindPatternImages.BOARD_BLOCK_PX
        // Block 2 sits in row 0, column 2 — its tone is palette[2] = #808080.
        val centre = image.getRGB(2 * scale + scale / 2, scale / 2) and 0xFFFFFF

        centre shouldBe 0x808080
    }

    @Test
    fun `the last row is drawn, not cropped`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val scale = FindPatternImages.BOARD_BLOCK_PX
        val lastIndex = FindPatternLayout.BLOCK_COUNT - 1
        val x = (lastIndex % FindPatternLayout.COLS) * scale + scale / 2
        val y = (lastIndex / FindPatternLayout.COLS) * scale + scale / 2

        (image.getRGB(x, y) and 0xFFFFFF) shouldBe 0x000000
    }
}
