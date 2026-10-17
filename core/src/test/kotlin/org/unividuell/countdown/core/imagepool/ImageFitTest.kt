package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.random.Random

class ImageFitTest {

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

    private fun decoded(bytes: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(bytes))

    @Test
    fun `a centre crop takes the middle at exactly the given ratio`() {
        val crop = ImageFit.centreCrop(source = bands(width = 2400, height = 600), ratioWidth = 4, ratioHeight = 3)

        crop.width shouldBe 800
        crop.height shouldBe 600
        val centre = Color(crop.getRGB(400, 300))
        (centre.green > centre.red && centre.green > centre.blue) shouldBe true
    }

    @Test
    fun `a centre crop hits an exact ratio that is no named shape`() {
        val crop = ImageFit.centreCrop(source = bands(width = 1200, height = 1600), ratioWidth = 40, ratioHeight = 53)

        crop.width shouldBe 1200
        crop.height shouldBe 1590
    }

    @Test
    fun `scaled lands on exactly the size asked for`() {
        val out = ImageFit.scaled(source = bands(width = 999, height = 501), width = 400, height = 300)

        out.width shouldBe 400
        out.height shouldBe 300
    }

    @Test
    fun `fitted scales down to the long edge and never up`() {
        val large = ImageFit.fitted(source = bands(width = 3000, height = 4000), ratioWidth = 3, ratioHeight = 4, longEdge = 1600)
        val small = ImageFit.fitted(source = bands(width = 300, height = 300), ratioWidth = 1, ratioHeight = 1, longEdge = 1600)

        (large.width to large.height) shouldBe (1200 to 1600)
        (small.width to small.height) shouldBe (300 to 300)
    }

    @Test
    fun `jpeg and png decode to the same size`() {
        val image = bands(width = 120, height = 90)

        decoded(ImageFit.jpeg(image = image, quality = 0.82f)).width shouldBe 120
        decoded(ImageFit.png(image)).height shouldBe 90
    }

    @Test
    fun `png keeps the alpha channel`() {
        val image = BufferedImage(2, 1, BufferedImage.TYPE_INT_ARGB)
        image.setRGB(0, 0, 0x00FF0000)
        image.setRGB(1, 0, 0xFF00FF00.toInt())

        val back = decoded(ImageFit.png(image))

        (back.getRGB(0, 0) ushr 24) shouldBe 0
        (back.getRGB(1, 0) ushr 24) shouldBe 255
    }

    @Test
    fun `an uncompressed PNG's length depends only on the image's size`() {
        val flat = BufferedImage(120, 120, BufferedImage.TYPE_INT_ARGB)
        val noise = BufferedImage(120, 120, BufferedImage.TYPE_INT_ARGB).also { img ->
            val random = Random(7)
            for (y in 0 until 120) for (x in 0 until 120) img.setRGB(x, y, random.nextInt())
        }

        ImageFit.pngUncompressed(flat).size shouldBe ImageFit.pngUncompressed(noise).size
        decoded(ImageFit.pngUncompressed(noise)).getRGB(5, 9) shouldBe noise.getRGB(5, 9)
    }
}
