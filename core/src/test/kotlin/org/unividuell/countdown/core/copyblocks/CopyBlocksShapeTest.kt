package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class CopyBlocksShapeTest {

    private fun box(xs: IntRange, ys: IntRange, zs: IntRange): Set<Cell> =
        xs.flatMap { x -> ys.flatMap { y -> zs.map { z -> Cell(x = x, y = y, z = z) } } }.toSet()

    @Test
    fun `a single block and a groove are fully visible`() {
        CopyBlocksShape.allVisible(setOf(Cell(x = 0, y = 0, z = 0))) shouldBe true
        val groove = box(xs = 0..2, ys = 0..0, zs = 0..2) + box(xs = 0..0, ys = 1..1, zs = 0..2) +
            box(xs = 2..2, ys = 1..1, zs = 0..2)
        CopyBlocksShape.allVisible(groove) shouldBe true
    }

    @Test
    fun `a solid cube hides its centre block`() {
        CopyBlocksShape.allVisible(box(xs = 0..2, ys = 0..2, zs = 0..2)) shouldBe false
    }

    @Test
    fun `a hollow cube hides its cavity`() {
        CopyBlocksShape.allVisible(box(xs = 0..2, ys = 0..2, zs = 0..2) - Cell(x = 1, y = 1, z = 1)) shouldBe false
    }

    @Test
    fun `a kinked tunnel reaches the outside but cannot be looked into`() {
        // The elbow (2,1,2) is walled in on all six lines; its tunnel bends at (3,1,2) and leaves at z = 1.
        val walls = setOf(
            Cell(x = 1, y = 1, z = 2), Cell(x = 4, y = 1, z = 2),
            Cell(x = 2, y = 0, z = 2), Cell(x = 2, y = 2, z = 2),
            Cell(x = 2, y = 1, z = 1), Cell(x = 2, y = 1, z = 3),
        )
        CopyBlocksShape.allVisible(walls) shouldBe false
        CopyBlocksShape.allVisible(walls - Cell(x = 2, y = 1, z = 1)) shouldBe true
    }
}
