package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.collections.shouldHaveAtLeastSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test

class FrayMaskTest {

    private val side = 100
    private val depth = 15.0

    private fun edgeDistance(x: Int, y: Int) = minOf(x, y, side - 1 - x, side - 1 - y) + 0.5

    @Test
    fun `the outer band is always transparent`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        for (y in 0 until side) for (x in 0 until side) {
            if (edgeDistance(x = x, y = y) <= 0.35 * depth) alpha[y * side + x] shouldBe 0f
        }
    }

    @Test
    fun `beyond the depth and its soft edge the patch is opaque`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        for (y in 0 until side) for (x in 0 until side) {
            if (edgeDistance(x = x, y = y) >= depth + depth / 4) alpha[y * side + x] shouldBe 1f
        }
    }

    @Test
    fun `the boundary wanders - the edge is no straight line`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        // Along the top border: how deep does the first half-opaque pixel sit in each column?
        val depths = (20 until 80).map { x -> (0 until side).first { y -> alpha[y * side + x] >= 0.5f } }

        depths.toSet() shouldHaveAtLeastSize 3
    }

    @Test
    fun `the same seed frays the same way, another seed differently`() {
        val a = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)
        val b = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)
        val c = FrayMask.alpha(width = side, height = side, depth = depth, seed = 8)

        a.toList() shouldBe b.toList()
        a.toList() shouldNotBe c.toList()
    }

    @Test
    fun `no depth is no fraying`() {
        FrayMask.alpha(width = 4, height = 3, depth = 0.0, seed = 7).toSet() shouldBe setOf(1f)
    }
}
