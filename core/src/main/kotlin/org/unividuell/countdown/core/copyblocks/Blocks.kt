package org.unividuell.countdown.core.copyblocks

/**
 * Declaration order is the draw: a round with N types plays the first N. The constant names are the
 * wire codes — renaming one breaks stored guesses and the client.
 */
enum class BlockType {
    DIRT,
    BRICKS,
    LEAVES,
    PACKED_ICE,
    STONE,
    HAY_BALE,
    LAPIS,
}

data class Cell(val x: Int, val y: Int, val z: Int)

data class Block(val x: Int, val y: Int, val z: Int, val type: BlockType) {

    /** A function, not a property: Jackson would serialise a property as a fourth field. */
    fun cell(): Cell = Cell(x = x, y = y, z = z)
}
