package org.unividuell.countdown.core.turnpipes

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.turnpipes.PipeKind.ELBOW
import org.unividuell.countdown.core.turnpipes.PipeKind.INLET
import org.unividuell.countdown.core.turnpipes.PipeKind.OUTLET
import org.unividuell.countdown.core.turnpipes.PipeKind.STRAIGHT

class PipeFlowTest {

    /** Snake 0 → 1 → 2 → 5 → 4 → 3 → 6 → 7 → 8 on a 3 × 3 board. */
    private val kinds = listOf(INLET, STRAIGHT, ELBOW, ELBOW, STRAIGHT, ELBOW, ELBOW, STRAIGHT, OUTLET)
    private val solved = listOf(1, 1, 2, 1, 1, 3, 0, 1, 3)

    private fun solvedWith(cell: Int, rotation: Int) =
        solved.toMutableList().also { it[cell] = rotation }

    @Test
    fun `the solved board carries water through every cell`() {
        PipeFlow.trace(size = 3, kinds = kinds, rotations = solved) shouldBe
            Flow(wet = listOf(0, 1, 2, 5, 4, 3, 6, 7, 8), reached = true, leak = null)
    }

    @Test
    fun `a pipe with no opening back stops the water`() {
        PipeFlow.trace(size = 3, kinds = kinds, rotations = solvedWith(cell = 1, rotation = 2)) shouldBe
            Flow(wet = listOf(0), reached = false, leak = Leak(at = 1, from = 0))
    }

    @Test
    fun `water off the board leaks into nothing`() {
        PipeFlow.trace(size = 3, kinds = kinds, rotations = solvedWith(cell = 0, rotation = 0)) shouldBe
            Flow(wet = listOf(0), reached = false, leak = Leak(at = null, from = 0))
    }

    @Test
    fun `reaching the outlet past dry pipes is reached, not all wet`() {
        val flow = PipeFlow.trace(size = 3, kinds = kinds, rotations = listOf(2, 1, 2, 0, 1, 2, 0, 1, 0))

        flow.wet shouldBe listOf(0, 3, 4, 5, 8)
        flow.reached shouldBe true
        flow.leak shouldBe null
    }

    @Test
    fun `a straight turned half way is the same pipe`() {
        val flow = PipeFlow.trace(size = 3, kinds = kinds, rotations = solvedWith(cell = 1, rotation = 3))

        flow.reached shouldBe true
        flow.wet.size shouldBe 9
    }
}
