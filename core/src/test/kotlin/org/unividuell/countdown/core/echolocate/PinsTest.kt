package org.unividuell.countdown.core.echolocate

import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class PinsTest {

    private val target = Cell(col = 5, row = 5)

    private fun holds(x: Double, y: Double = 5.5, target: Cell = this.target) =
        inBlock(pin = Pin(x = x, y = y), target = target, grid = 20, tolerance = 1)

    @Test
    fun `the distance runs to the cell's centre`() {
        distanceToCentre(pin = Pin(x = 3.5, y = 4.5), cell = Cell(col = 0, row = 0)) shouldBe (5.0 plusOrMinus 1e-12)
        distanceToCentre(pin = Pin(x = 5.5, y = 5.5), cell = target) shouldBe 0.0
    }

    @Test
    fun `the 3 by 3 block holds its edge and refuses the next cell`() {
        holds(x = 4.0) shouldBe true
        holds(x = 3.999) shouldBe false
        holds(x = 6.999) shouldBe true
        holds(x = 7.0) shouldBe false

        holds(x = 5.5, y = 4.0) shouldBe true
        holds(x = 5.5, y = 3.999) shouldBe false
        holds(x = 5.5, y = 6.999) shouldBe true
        holds(x = 5.5, y = 7.0) shouldBe false
    }

    @Test
    fun `the tolerance sets the block's size`() {
        inBlock(pin = Pin(x = 5.5, y = 5.5), target = target, grid = 20, tolerance = 0) shouldBe true
        inBlock(pin = Pin(x = 6.5, y = 5.5), target = target, grid = 20, tolerance = 0) shouldBe false
        inBlock(pin = Pin(x = 7.5, y = 5.5), target = target, grid = 20, tolerance = 2) shouldBe true
    }

    @Test
    fun `a pin on the far edge belongs to the last cell`() {
        // x = 20.0 is column 19, not 20: still 1 away from column 18, and 2 from column 17.
        holds(x = 20.0, target = Cell(col = 18, row = 5)) shouldBe true
        holds(x = 20.0, target = Cell(col = 17, row = 5)) shouldBe false

        holds(x = 5.5, y = 20.0, target = Cell(col = 5, row = 18)) shouldBe true
        holds(x = 5.5, y = 20.0, target = Cell(col = 5, row = 17)) shouldBe false
    }

    @Test
    fun `two pins are matched by the smallest sum, in either order`() {
        val targets = listOf(Cell(col = 2, row = 2), Cell(col = 15, row = 15))
        val near0 = Pin(x = 2.5, y = 3.0)
        val near1 = Pin(x = 15.0, y = 15.5)

        pinOf(pins = listOf(near0, near1), targets = targets) shouldBe listOf(0, 1)
        pinOf(pins = listOf(near1, near0), targets = targets) shouldBe listOf(1, 0)
    }

    @Test
    fun `one pin is matched to its only target`() {
        pinOf(pins = listOf(Pin(x = 1.0, y = 1.0)), targets = listOf(target)) shouldBe listOf(0)
    }

    @Test
    fun `a tie keeps the pins' order`() {
        val targets = listOf(Cell(col = 2, row = 2), Cell(col = 15, row = 15))
        val pin = Pin(x = 9.0, y = 9.0)

        pinOf(pins = listOf(pin, pin), targets = targets) shouldBe listOf(0, 1)
    }
}
