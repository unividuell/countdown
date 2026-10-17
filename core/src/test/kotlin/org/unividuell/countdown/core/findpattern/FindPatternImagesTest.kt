package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

class FindPatternImagesTest {

    private val palette = listOf("#ffffff", "#c0c0c0", "#808080", "#000000")
    private val blocks = List(FindPatternLayout.BLOCK_COUNT) { it % FindPatternLayout.PALETTE_SIZE }

    private fun decode(png: ByteArray) = ImageIO.read(ByteArrayInputStream(png))

    @Test
    fun `the board decodes to the grid at its block size`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))

        image.width shouldBe FindPatternLayout.COLS * FindPatternImages.BOARD_BLOCK_PX
        image.height shouldBe FindPatternLayout.ROWS * FindPatternImages.BOARD_BLOCK_PX
    }

    @Test
    fun `it is a PNG`() {
        val png = FindPatternImages.board(blocks = blocks, palette = palette)

        png.take(PNG_SIGNATURE.size) shouldBe PNG_SIGNATURE
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

    private companion object {
        val PNG_SIGNATURE = listOf(0x89, 'P'.code, 'N'.code, 'G'.code).map { it.toByte() }
    }
}
