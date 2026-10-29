package org.unividuell.countdown.core.echolocate

import io.kotest.assertions.withClue
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.hypot

class FieldTest {

    private fun distance(a: Cell, b: Cell): Double =
        hypot(x = (a.col - b.col).toDouble(), y = (a.row - b.row).toDouble())

    @Test
    fun `targets keep 5 cells apart, every source 2 from all others`() {
        for (clips in 1..2) {
            for (seed in 1..200) {
                val layout = FieldLayout.place(random = SeededRandom.fromSeed(seed), grid = 20, clips = clips, noises = 6)

                withClue("seed $seed, $clips clips") {
                    layout.targets shouldHaveSize clips
                    layout.noises shouldHaveSize 6

                    val sources = layout.targets + layout.noises.map { it.cell }
                    sources.forEach {
                        it.col shouldBeInRange 0..19
                        it.row shouldBeInRange 0..19
                    }

                    layout.targets.forEachIndexed { i, a ->
                        layout.targets.drop(i + 1).forEach { b ->
                            distance(a, b) shouldBeGreaterThanOrEqual FieldLayout.MIN_CLIP_DISTANCE
                        }
                    }
                    sources.forEachIndexed { i, a ->
                        sources.drop(i + 1).forEach { b ->
                            distance(a, b) shouldBeGreaterThanOrEqual FieldLayout.MIN_SOURCE_DISTANCE
                        }
                    }
                }
            }
        }
    }

    @Test
    fun `the kinds go round in order`() {
        val layout = FieldLayout.place(random = SeededRandom.fromSeed(7), grid = 20, clips = 2, noises = 6)

        layout.noises.map { it.kind } shouldContainExactly listOf(
            NoiseKind.BIRDS, NoiseKind.BROOK, NoiseKind.COW, NoiseKind.WIND, NoiseKind.RAIN, NoiseKind.BIRDS,
        )
    }

    @Test
    fun `targets are drawn before the noises`() {
        for (seed in 1..50) {
            val one = FieldLayout.place(random = SeededRandom.fromSeed(seed), grid = 20, clips = 1, noises = 6)
            val two = FieldLayout.place(random = SeededRandom.fromSeed(seed), grid = 20, clips = 2, noises = 6)

            two.targets.first() shouldBe one.targets.first()
        }
    }

    @Test
    fun `the same seed draws the same layout`() {
        FieldLayout.place(random = SeededRandom.fromSeed(11), grid = 20, clips = 2, noises = 6) shouldBe
            FieldLayout.place(random = SeededRandom.fromSeed(11), grid = 20, clips = 2, noises = 6)
    }

    @Test
    fun `after 200 attempts a source takes the last drawn cell`() {
        // A 3 × 3 field cannot hold 9 sources 2 apart: later ones fall back.
        val layout = FieldLayout.place(random = SeededRandom.fromSeed(5), grid = 3, clips = 1, noises = 8)

        layout.targets shouldHaveSize 1
        layout.noises shouldHaveSize 8
    }

    @Test
    fun `a source that never fits is tried exactly 200 times`() {
        // grid 1: the target takes the only cell, so the noise fails every attempt.
        val random = SeededRandom.fromSeed(3)

        val layout = FieldLayout.place(random = random, grid = 1, clips = 1, noises = 1)

        layout.noises.single().cell shouldBe Cell(col = 0, row = 0)

        // 1 target attempt + 200 noise attempts, a column and a row each.
        val replay = SeededRandom.fromSeed(3)
        repeat(times = 2 * (1 + FieldLayout.ATTEMPTS)) { replay.nextInt(1) }
        random.nextUint32() shouldBe replay.nextUint32()
    }
}
