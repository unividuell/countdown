package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class CopyBlocksGeneratorTest {

    private val types = BlockType.entries.take(5)

    private fun generate(seed: Int, count: Int) = CopyBlocksGenerator.generate(
        presentation = SeededRandom.fromSeed(seed), grid = 6, count = count, types = types,
    )

    /** Face-to-face neighbours only: a template must be buildable block by block. */
    private fun connected(cells: Set<Cell>): Boolean {
        val seen = mutableSetOf(cells.first())
        val queue = ArrayDeque(seen)
        while (queue.isNotEmpty()) {
            val c = queue.removeFirst()
            listOf(
                c.copy(x = c.x + 1), c.copy(x = c.x - 1), c.copy(y = c.y + 1),
                c.copy(y = c.y - 1), c.copy(z = c.z + 1), c.copy(z = c.z - 1),
            ).filter { it in cells && seen.add(it) }.forEach(queue::addLast)
        }
        return seen.size == cells.size
    }

    @Test
    fun `every count up to 58 is reached in a cube of six`() {
        listOf(8, 30, 45, 58).forEach { count ->
            (1..50).forEach { seed -> generate(seed = seed, count = count).size shouldBe count }
        }
    }

    @Test
    fun `a template is normalised, inside the cube, one piece, fully visible, of the given types`() {
        (1..50).forEach { seed ->
            val blocks = generate(seed = seed, count = 40)
            val cells = blocks.map { it.cell() }.toSet()

            cells.size shouldBe blocks.size
            listOf(blocks.minOf { it.x }, blocks.minOf { it.y }, blocks.minOf { it.z }) shouldBe listOf(0, 0, 0)
            blocks.maxOf { maxOf(it.x, it.y, it.z) } shouldBeLessThan 6
            connected(cells) shouldBe true
            CopyBlocksShape.allVisible(cells) shouldBe true
            types.containsAll(blocks.map { it.type }) shouldBe true
        }
    }

    @Test
    fun `one seed is one template`() {
        generate(seed = 7, count = 30) shouldBe generate(seed = 7, count = 30)
        (1..10).map { generate(seed = it, count = 30) }.toSet().size shouldBeGreaterThan 1
    }
}
