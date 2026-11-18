package org.unividuell.countdown.core.turnpipes

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.turnpipes.PipeKind.ELBOW
import org.unividuell.countdown.core.turnpipes.PipeKind.INLET
import org.unividuell.countdown.core.turnpipes.PipeKind.OUTLET
import org.unividuell.countdown.core.turnpipes.PipeKind.STRAIGHT

class PipesTest {

    @Test
    fun `openings at rotation 0 follow the table`() {
        Pipes.openings(kind = STRAIGHT, rotation = 0) shouldBe 0b0101
        Pipes.openings(kind = ELBOW, rotation = 0) shouldBe 0b0011
        Pipes.openings(kind = INLET, rotation = 0) shouldBe 0b0001
        Pipes.openings(kind = OUTLET, rotation = 0) shouldBe 0b0001
    }

    @Test
    fun `every rotation turns clockwise`() {
        Pipes.openings(kind = ELBOW, rotation = 1) shouldBe 0b0110
        Pipes.openings(kind = ELBOW, rotation = 2) shouldBe 0b1100
        Pipes.openings(kind = ELBOW, rotation = 3) shouldBe 0b1001
        Pipes.openings(kind = STRAIGHT, rotation = 1) shouldBe 0b1010
        Pipes.openings(kind = INLET, rotation = 3) shouldBe 0b1000
        Pipes.openings(kind = STRAIGHT, rotation = 2) shouldBe Pipes.openings(kind = STRAIGHT, rotation = 0)
    }

    @Test
    fun `neighbours stop at the border`() {
        Pipes.neighbour(size = 3, cell = 0, direction = Pipes.NORTH) shouldBe null
        Pipes.neighbour(size = 3, cell = 0, direction = Pipes.WEST) shouldBe null
        Pipes.neighbour(size = 3, cell = 0, direction = Pipes.EAST) shouldBe 1
        Pipes.neighbour(size = 3, cell = 0, direction = Pipes.SOUTH) shouldBe 3
        Pipes.neighbour(size = 3, cell = 8, direction = Pipes.EAST) shouldBe null
    }
}
