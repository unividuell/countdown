package org.unividuell.countdown.core.deduster

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

class DedusterImagesTest {

    /** Three vertical bands: red | green | blue, so a centre crop is visible in the result. */
    private fun bands(width: Int, height: Int): BufferedImage {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply {
            color = Color.RED; fillRect(0, 0, width / 3, height)
            color = Color.GREEN; fillRect(width / 3, 0, width / 3, height)
            color = Color.BLUE; fillRect(2 * width / 3, 0, width - 2 * width / 3, height)
            dispose()
        }
        return img
    }

    private fun decoded(bytes: ByteArray) = ImageIO.read(ByteArrayInputStream(bytes))

    @Test
    fun `a wide photo is cropped in the middle to the grid's ratio`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 2400, height = 600), grid = DedusterGrid.LANDSCAPE, longEdge = 1600, quality = 0.82f),
        )

        // 600 high → 800 wide at 4:3, taken from the middle third: green, nothing of red or blue.
        out.width shouldBe 800
        out.height shouldBe 600
        val centre = Color(out.getRGB(400, 300))
        (centre.green > centre.red && centre.green > centre.blue) shouldBe true
        val left = Color(out.getRGB(5, 300))
        (left.green > left.red) shouldBe true
    }

    @Test
    fun `a large photo is scaled to the long edge`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 3000, height = 4000), grid = DedusterGrid.PORTRAIT, longEdge = 1600, quality = 0.82f),
        )

        out.width shouldBe 1200
        out.height shouldBe 1600
    }

    @Test
    fun `a small photo is never blown up`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 300, height = 300), grid = DedusterGrid.SQUARE, longEdge = 1600, quality = 0.82f),
        )

        out.width shouldBe 300
        out.height shouldBe 300
    }
}
