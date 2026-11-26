package org.unividuell.countdown.core.stackfloor

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class TowerTest {

    private val g = TowerGeometry(
        fieldWidth = 1000, startWidth = 660, speedNum = 1, speedDen = 2, accelPercent = 3, maxFloors = 999,
    )

    @Test
    fun `the foundation is centred`() {
        Tower.foundation(geometry = g) shouldBe Bar(left = 170, width = 660)
    }

    @Test
    fun `even floors start left, odd floors start right`() {
        Tower.position(geometry = g, floor = 0, width = 660, ms = 0) shouldBe 0
        Tower.position(geometry = g, floor = 1, width = 660, ms = 0) shouldBe 340
    }

    @Test
    fun `the bar bounces off the edges`() {
        Tower.position(geometry = g, floor = 0, width = 660, ms = 680) shouldBe 340
        Tower.position(geometry = g, floor = 0, width = 660, ms = 1000) shouldBe 180
        Tower.position(geometry = g, floor = 0, width = 660, ms = 1360) shouldBe 0
        Tower.position(geometry = g, floor = 0, width = 660, ms = 1361) shouldBe 0
        Tower.position(geometry = g, floor = 0, width = 660, ms = 1362) shouldBe 1
    }

    @Test
    fun `each floor slides faster by accelPercent`() {
        // 100 ms at 1/2 unit per ms: floor 0 travels 50 units, floor 10 at 130 % travels 65.
        Tower.position(geometry = g, floor = 0, width = 660, ms = 100) shouldBe 50
        Tower.position(geometry = g, floor = 10, width = 660, ms = 100) shouldBe 65
        Tower.position(geometry = g.copy(accelPercent = 0), floor = 10, width = 660, ms = 100) shouldBe 50
    }

    @Test
    fun `the overhang is cut on either side`() {
        Tower.place(below = Bar(left = 170, width = 660), x = 0, width = 660) shouldBe Bar(left = 170, width = 490)
        Tower.place(below = Bar(left = 170, width = 660), x = 340, width = 660) shouldBe Bar(left = 340, width = 490)
    }

    @Test
    fun `touching the edge is a miss`() {
        Tower.place(below = Bar(left = 170, width = 660), x = 830, width = 100) shouldBe null
        Tower.place(below = Bar(left = 170, width = 660), x = 70, width = 100) shouldBe null
    }

    @Test
    fun `three clicks at zero build two floors and miss`() {
        val result = Tower.build(geometry = g, clicks = listOf(0, 0, 0))

        result.bars shouldBe listOf(Bar(left = 170, width = 660), Bar(left = 170, width = 490), Bar(left = 510, width = 150))
        result.missed shouldBe true
        result.height shouldBe 2
    }

    @Test
    fun `clicks after the miss are ignored`() {
        Tower.build(geometry = g, clicks = listOf(0, 0, 0, 5)) shouldBe
            Tower.build(geometry = g, clicks = listOf(0, 0, 0))
    }

    @Test
    fun `the tower stops at maxFloors`() {
        val result = Tower.build(geometry = g.copy(maxFloors = 2), clicks = listOf(0, 0, 0))

        result.height shouldBe 2
        result.missed shouldBe false
    }
}
