package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.AspectRatio

class PlacePatchLayoutTest {

    @Test
    fun `the rows follow the photo's shape at 40 columns`() {
        PlacePatchLayout.of(aspect = AspectRatio.LANDSCAPE) shouldBe PlacePatchLayout(cols = 40, rows = 30, size = 10)
        PlacePatchLayout.of(aspect = AspectRatio.SQUARE) shouldBe PlacePatchLayout(cols = 40, rows = 40, size = 10)
        PlacePatchLayout.of(aspect = AspectRatio.PORTRAIT) shouldBe PlacePatchLayout(cols = 40, rows = 53, size = 10)
    }

    @Test
    fun `another grid is two constants away`() {
        PlacePatchLayout.of(aspect = AspectRatio.LANDSCAPE, cols = 20, size = 5) shouldBe
            PlacePatchLayout(cols = 20, rows = 15, size = 5)
    }

    @Test
    fun `a cell is whole, square, at most 30 px, and never zero`() {
        val layout = PlacePatchLayout(cols = 40, rows = 30, size = 10)

        layout.cellPx(cropWidth = 2000) shouldBe 30
        layout.cellPx(cropWidth = 1200) shouldBe 30
        layout.cellPx(cropWidth = 400) shouldBe 10
        layout.cellPx(cropWidth = 30) shouldBe 1
    }
}
