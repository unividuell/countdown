package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.internal.DetectedFormat
import org.unividuell.countdown.core.imagepool.internal.ImageIntake
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

class ImageIntakeTest {

    private fun encoded(format: String, width: Int, height: Int): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.color = Color.GREEN
        g.fillRect(0, 0, width, height)
        g.dispose()
        val out = ByteArrayOutputStream()
        ImageIO.write(img, format, out)
        return out.toByteArray()
    }

    private fun fixture(name: String): ByteArray =
        javaClass.getResourceAsStream("/imagepool/$name")!!.readBytes()

    @Test
    fun `recognises the four accepted formats by their magic bytes`() {
        ImageIntake.detect(encoded(format = "jpeg", width = 8, height = 8)) shouldBe DetectedFormat.Supported("image/jpeg")
        ImageIntake.detect(encoded(format = "png", width = 8, height = 8)) shouldBe DetectedFormat.Supported("image/png")
        ImageIntake.detect(encoded(format = "gif", width = 8, height = 8)) shouldBe DetectedFormat.Supported("image/gif")
        // RIFF....WEBP -- the header is all detect() looks at
        val webp = "RIFF".toByteArray() + ByteArray(4) + "WEBP".toByteArray() + ByteArray(8)
        ImageIntake.detect(webp) shouldBe DetectedFormat.Supported("image/webp")
    }

    @Test
    fun `names HEIC instead of calling it unknown`() {
        // ....ftypheic -- the box header an iPhone photo starts with
        val heic = ByteArray(4) + "ftypheic".toByteArray() + ByteArray(8)
        ImageIntake.detect(heic) shouldBe DetectedFormat.Heic
    }

    @Test
    fun `refuses anything else`() {
        ImageIntake.detect("not an image at all".toByteArray()) shouldBe DetectedFormat.Unknown
        ImageIntake.detect(ByteArray(2)) shouldBe DetectedFormat.Unknown
    }

    @Test
    fun `reads dimensions from the header`() {
        ImageIntake.probe(bytes = encoded(format = "jpeg", width = 64, height = 32), mediaType = "image/jpeg").width shouldBe 64
        ImageIntake.probe(bytes = encoded(format = "jpeg", width = 64, height = 32), mediaType = "image/jpeg").height shouldBe 32
        ImageIntake.probe(bytes = encoded(format = "png", width = 7, height = 130), mediaType = "image/png").height shouldBe 130
    }

    @Test
    fun `a WebP reader is actually registered`() {
        // The twelvemonkeys plugin arrives through ServiceLoader. If the nested-jar layout ever
        // hides META-INF/services, this fails here instead of on a user's upload.
        ImageIO.getImageReadersByMIMEType("image/webp").hasNext() shouldBe true
    }

    @Test
    fun `the thumbnail keeps the aspect ratio and fits the long edge`() {
        val thumb = ImageIntake.thumbnail(
            bytes = encoded(format = "jpeg", width = 1000, height = 500),
            mediaType = "image/jpeg",
            maxEdge = 400,
        )
        val img = ImageIO.read(ByteArrayInputStream(thumb))
        img.width shouldBe 400
        img.height shouldBe 200
        ImageIntake.detect(thumb) shouldBe DetectedFormat.Supported("image/jpeg")
    }

    @Test
    fun `an image smaller than the target is not blown up`() {
        val thumb = ImageIntake.thumbnail(
            bytes = encoded(format = "png", width = 40, height = 20),
            mediaType = "image/png",
            maxEdge = 400,
        )
        val img = ImageIO.read(ByteArrayInputStream(thumb))
        img.width shouldBe 40
        img.height shouldBe 20
    }

    @Test
    fun `EXIF orientation is applied -- a portrait photo does not lie on its side`() {
        val thumb = ImageIntake.thumbnail(
            bytes = fixture("exif-orientation-6.jpg"),
            mediaType = "image/jpeg",
            maxEdge = 400,
        )
        val img = ImageIO.read(ByteArrayInputStream(thumb))

        // orientation 6 = rotate 90° clockwise: 40x20 landscape becomes 20x40 portrait...
        img.width shouldBe 20
        img.height shouldBe 40
        // ...and the red half, on the LEFT before, is on TOP after. Asserted as a comparison
        // between channels, not against an exact value: JPEG is lossy and 255 never survives.
        val top = Color(img.getRGB(10, 5))
        val bottom = Color(img.getRGB(10, 35))
        (top.red > top.blue) shouldBe true
        (bottom.blue > bottom.red) shouldBe true
    }
}
