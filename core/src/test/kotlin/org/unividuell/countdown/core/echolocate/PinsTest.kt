package org.unividuell.countdown.core.echolocate

import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class PinsTest {

    private val target = Cell(col = 5, row = 5)

    @Test
    fun `the distance runs to the cell's centre`() {
        distanceToCentre(pin = Pin(x = 3.5, y = 4.5), cell = Cell(col = 0, row = 0)) shouldBe (5.0 plusOrMinus 1e-12)
        distanceToCentre(pin = Pin(x = 5.5, y = 5.5), cell = target) shouldBe 0.0
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
