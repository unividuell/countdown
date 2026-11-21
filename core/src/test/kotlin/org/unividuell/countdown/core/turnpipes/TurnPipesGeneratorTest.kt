package org.unividuell.countdown.core.turnpipes

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.turnpipes.PipeKind.ELBOW
import org.unividuell.countdown.core.turnpipes.PipeKind.INLET
import org.unividuell.countdown.core.turnpipes.PipeKind.OUTLET
import org.unividuell.countdown.core.turnpipes.PipeKind.STRAIGHT
import kotlin.math.abs

class TurnPipesGeneratorTest {

    private val seeds = 1..200
    private val sizes = 6..8

    private fun boards() = sizes.flatMap { size ->
        seeds.map { seed -> size to TurnPipesGenerator.generate(random = SeededRandom.fromSeed(seed), size = size) }
    }

    private fun onBorder(size: Int, cell: Int) =
        cell % size in listOf(0, size - 1) || cell / size in listOf(0, size - 1)

    private fun distance(size: Int, a: Int, b: Int) =
        abs(a % size - b % size) + abs(a / size - b / size)

    @Test
    fun `the path visits every cell once, neighbour after neighbour`() {
        for ((size, board) in boards()) {
            board.path.sorted() shouldBe (0 until size * size).toList()

            board.path.zipWithNext().forEach { (a, b) ->
                (0..3).any { Pipes.neighbour(size = size, cell = a, direction = it) == b } shouldBe true
            }
        }
    }

    @Test
    fun `the ends sit on the border, at least three apart`() {
        for ((size, board) in boards()) {
            board.kinds[board.path.first()] shouldBe INLET
            board.kinds[board.path.last()] shouldBe OUTLET
            board.kinds.count { it == INLET } shouldBe 1
            board.kinds.count { it == OUTLET } shouldBe 1

            onBorder(size = size, cell = board.path.first()) shouldBe true
            onBorder(size = size, cell = board.path.last()) shouldBe true
            distance(size = size, a = board.path.first(), b = board.path.last()) shouldBeGreaterThanOrEqual
                TurnPipesGenerator.MIN_END_DISTANCE
        }
    }

    @Test
    fun `the kinds follow the path`() {
        for ((size, board) in boards()) {
            for (i in 1 until board.path.lastIndex) {
                val cell = board.path[i]
                val back = (0..3).first { Pipes.neighbour(size = size, cell = cell, direction = it) == board.path[i - 1] }
                val ahead = (0..3).first { Pipes.neighbour(size = size, cell = cell, direction = it) == board.path[i + 1] }

                board.kinds[cell] shouldBe if (ahead == Pipes.opposite(back)) STRAIGHT else ELBOW
            }
        }
    }

    @Test
    fun `the solution carries water through every cell`() {
        for ((size, board) in boards()) {
            val flow = PipeFlow.trace(size = size, kinds = board.kinds, rotations = board.solution)

            flow.reached shouldBe true
            flow.wet shouldBe board.path
        }
    }

    @Test
    fun `the scrambled start is not solved`() {
        for ((size, board) in boards()) {
            val random = SeededRandom.fromSeed(1)
            val start = TurnPipesGenerator.scramble(random = random, board = board)

            start shouldHaveSize size * size
            start.all { it in 0..3 } shouldBe true

            val flow = PipeFlow.trace(size = size, kinds = board.kinds, rotations = start)
            (flow.reached && flow.wet.size == size * size) shouldBe false
        }
    }

    @Test
    fun `the same seed draws the same board`() {
        fun draw(): Pair<PipeBoard, List<Int>> {
            val random = SeededRandom.fromSeed(7)
            val board = TurnPipesGenerator.generate(random = random, size = 7)

            return board to TurnPipesGenerator.scramble(random = random, board = board)
        }

        draw() shouldBe draw()

        boards().filter { it.first == 7 }.map { it.second.path }.distinct().size shouldBeGreaterThan 190
    }
}
