package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThanOrEqual
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.math.abs

class PlacePatchImagesTest {

    private val landscape = PlacePatchLayout(cols = 40, rows = 30, size = 10)

    private fun solid(width: Int, height: Int, color: Color): BufferedImage {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { this.color = color; fillRect(0, 0, width, height); dispose() }
        return img
    }

    private fun decoded(bytes: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(bytes))

    private fun channels(rgb: Int) = Triple((rgb shr 16) and 0xFF, (rgb shr 8) and 0xFF, rgb and 0xFF)

    @Test
    fun `a frozen photo is the layout's cells, at most 30 px each`() {
        val wide = decoded(PlacePatchImages.freeze(source = solid(width = 2000, height = 1500, color = Color.BLUE), layout = landscape))
        val portrait = decoded(
            PlacePatchImages.freeze(
                source = solid(width = 3000, height = 4000, color = Color.BLUE),
                layout = PlacePatchLayout(cols = 40, rows = 53, size = 10),
            ),
        )

        (wide.width to wide.height) shouldBe (1200 to 900)
        (portrait.width to portrait.height) shouldBe (1200 to 1590)
    }

    @Test
    fun `a small photo is not blown up, a tiny one still yields a board`() {
        val small = decoded(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.BLUE), layout = landscape))
        val tiny = decoded(PlacePatchImages.freeze(source = solid(width = 30, height = 20, color = Color.BLUE), layout = landscape))

        (small.width to small.height) shouldBe (400 to 300)
        (tiny.width to tiny.height) shouldBe (40 to 30)
    }

    @Test
    fun `frozen asks the pool for enough pixels and says null when the image is gone`() {
        val gone = UUID.randomUUID()
        val pool = mockk<ImagePoolQuery> {
            every { displayed(id = gone, minShortEdge = 900) } returns null
        }

        PlacePatchImages(pool).frozen(imageId = gone, layout = landscape).shouldBeNull()
    }

    @Test
    fun `the board is grey, and equally light colours become the same grey`() {
        // OKLab lightness of pure red is 0.628, which is the grey (136, 136, 136).
        val photo = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)
        photo.createGraphics().apply {
            color = Color(255, 0, 0); fillRect(0, 0, 200, 300)
            color = Color(136, 136, 136); fillRect(200, 0, 200, 300)
            dispose()
        }

        val board = decoded(PlacePatchImages.board(PlacePatchImages.freeze(source = photo, layout = landscape)))
        val (r, g, b) = channels(board.getRGB(100, 150))
        val (grey, _, _) = channels(board.getRGB(300, 150))

        (r == g && g == b) shouldBe true
        abs(r - grey) shouldBeLessThanOrEqual 4
    }

    @Test
    fun `white stays white and black stays black`() {
        val white = decoded(
            PlacePatchImages.board(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.WHITE), layout = landscape)),
        )
        val black = decoded(
            PlacePatchImages.board(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.BLACK), layout = landscape)),
        )

        channels(white.getRGB(200, 150)).first shouldBe 255
        channels(black.getRGB(200, 150)).first shouldBe 0
    }

    @Test
    fun `the patch is its cells in colour, opaque inside, transparent at the edge`() {
        val frozen = PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color(0, 0, 255)), layout = landscape)

        val patch = decoded(PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 5, y = 5, fraySeed = 11))
        val centre = patch.getRGB(50, 50)

        (patch.width to patch.height) shouldBe (100 to 100)
        (centre ushr 24) shouldBe 255
        channels(centre).third shouldBeGreaterThanOrEqual 240
        (patch.getRGB(0, 0) ushr 24) shouldBe 0
    }

    @Test
    fun `the patch is the same for the same round and frays differently for another seed`() {
        val frozen = PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.GREEN), layout = landscape)
        fun alphas(seed: Int) = decoded(PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = seed))
            .let { img -> (0 until img.height).flatMap { y -> (0 until img.width).map { x -> img.getRGB(x, y) ushr 24 } } }

        PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = 11) shouldBe
            PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = 11)
        alphas(seed = 11) shouldNotBe alphas(seed = 12)
    }
}
