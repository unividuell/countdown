package org.unividuell.countdown.core.copyblocks

import org.unividuell.countdown.core.rng.SeededRandom

object CopyBlocksGenerator {

    private const val ATTEMPTS_PER_BLOCK = 300

    /** Draw order is part of a round's identity: +x, −x, +y, −y, +z, −z. */
    private val DIRECTIONS = listOf(
        Cell(x = 1, y = 0, z = 0), Cell(x = -1, y = 0, z = 0),
        Cell(x = 0, y = 1, z = 0), Cell(x = 0, y = -1, z = 0),
        Cell(x = 0, y = 0, z = 1), Cell(x = 0, y = 0, z = -1),
    )

    /**
     * Grows a template block by block from the cube's centre. Each new block touches an existing one
     * face to face — so it can be built Minecraft-style — and stays only if everything is still
     * visible. Gives up after a fixed number of attempts and returns what it has.
     *
     * Every draw comes from [presentation], in a fixed order: the type of a block only after it is
     * accepted. Reordering them changes every round ever drawn.
     */
    fun generate(presentation: SeededRandom, grid: Int, count: Int, types: List<BlockType>): List<Block> {
        val centre = grid / 2
        val blocks = mutableListOf(Block(x = centre, y = centre, z = centre, type = presentation.pick(types)))
        val occupied = mutableSetOf(blocks.first().cell())

        var attempts = 0
        while (blocks.size < count && attempts < count * ATTEMPTS_PER_BLOCK) {
            attempts++

            val from = presentation.pick(blocks)
            val direction = presentation.pick(DIRECTIONS)
            val next = Cell(x = from.x + direction.x, y = from.y + direction.y, z = from.z + direction.z)

            if (listOf(next.x, next.y, next.z).any { it !in 0 until grid } || next in occupied) continue
            if (!CopyBlocksShape.allVisible(occupied + next)) continue

            occupied += next
            blocks += Block(x = next.x, y = next.y, z = next.z, type = presentation.pick(types))
        }

        // Shifted to the origin, so the template does not remember where in the cube it grew.
        val minX = blocks.minOf { it.x }
        val minY = blocks.minOf { it.y }
        val minZ = blocks.minOf { it.z }

        return blocks.map { it.copy(x = it.x - minX, y = it.y - minY, z = it.z - minZ) }
    }
}
