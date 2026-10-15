package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class AspectRatioTest {

    @Test
    fun `the thresholds are the geometric means of the three shapes`() {
        AspectRatio.of(width = 11547, height = 10000) shouldBe AspectRatio.LANDSCAPE
        AspectRatio.of(width = 11546, height = 10000) shouldBe AspectRatio.SQUARE
        AspectRatio.of(width = 8661, height = 10000) shouldBe AspectRatio.SQUARE
        AspectRatio.of(width = 8660, height = 10000) shouldBe AspectRatio.PORTRAIT
    }

    @Test
    fun `a phone photo lands on its orientation`() {
        AspectRatio.of(width = 4000, height = 3000) shouldBe AspectRatio.LANDSCAPE
        AspectRatio.of(width = 3000, height = 4000) shouldBe AspectRatio.PORTRAIT
        AspectRatio.of(width = 1080, height = 1080) shouldBe AspectRatio.SQUARE
    }

    @Test
    fun `each shape names its ratio`() {
        (AspectRatio.LANDSCAPE.width to AspectRatio.LANDSCAPE.height) shouldBe (4 to 3)
        (AspectRatio.PORTRAIT.width to AspectRatio.PORTRAIT.height) shouldBe (3 to 4)
        (AspectRatio.SQUARE.width to AspectRatio.SQUARE.height) shouldBe (1 to 1)
    }
}
