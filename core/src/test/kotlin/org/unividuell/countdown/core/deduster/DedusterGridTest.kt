package org.unividuell.countdown.core.deduster

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class DedusterGridTest {

    @Test
    fun `the thresholds are the geometric means of the three targets`() {
        DedusterGrid.of(width = 11547, height = 10000) shouldBe DedusterGrid.LANDSCAPE
        DedusterGrid.of(width = 11546, height = 10000) shouldBe DedusterGrid.SQUARE
        DedusterGrid.of(width = 8661, height = 10000) shouldBe DedusterGrid.SQUARE
        DedusterGrid.of(width = 8660, height = 10000) shouldBe DedusterGrid.PORTRAIT
    }

    @Test
    fun `a phone photo lands on its orientation`() {
        DedusterGrid.of(width = 4000, height = 3000) shouldBe DedusterGrid.LANDSCAPE
        DedusterGrid.of(width = 3000, height = 4000) shouldBe DedusterGrid.PORTRAIT
        DedusterGrid.of(width = 1080, height = 1080) shouldBe DedusterGrid.SQUARE
    }

    @Test
    fun `the tile count stays all but fixed, so averages stay comparable`() {
        DedusterGrid.LANDSCAPE.tiles shouldBe 48
        DedusterGrid.PORTRAIT.tiles shouldBe 48
        DedusterGrid.SQUARE.tiles shouldBe 49
    }

    @Test
    fun `a stored layout finds its grid again`() {
        DedusterGrid.ofLayout(cols = 6, rows = 8) shouldBe DedusterGrid.PORTRAIT
    }
}
