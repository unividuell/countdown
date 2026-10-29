package org.unividuell.countdown.core.echolocate

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import org.junit.jupiter.api.Test

class EchoTest {

    private fun layoutOf(targets: List<Cell>, noises: List<NoiseSource> = emptyList()) =
        Layout(targets = targets, noises = noises)

    @Test
    fun `a source within reach sounds after distance over speed`() {
        // Ping (0.5, 0.5) to the centre (3.5, 4.5): a 3-4-5 triangle, 5 / 3 s.
        val layout = layoutOf(targets = listOf(Cell(col = 3, row = 4)))

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 12.0, speed = 3.0) shouldContainExactly listOf(
            EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 1667),
        )
    }

    @Test
    fun `a source exactly at reach sounds, one beyond does not`() {
        val layout = layoutOf(targets = listOf(Cell(col = 3, row = 4)))

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 5.0, speed = 3.0) shouldContainExactly listOf(
            EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 1667),
        )
        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 4.999, speed = 3.0).shouldBeEmpty()
    }

    @Test
    fun `hits are sorted by delay, clips carry their index, noises none`() {
        val layout = layoutOf(
            targets = listOf(Cell(col = 10, row = 0), Cell(col = 2, row = 0)),
            noises = listOf(
                NoiseSource(cell = Cell(col = 5, row = 0), kind = NoiseKind.BIRDS),
                NoiseSource(cell = Cell(col = 0, row = 7), kind = NoiseKind.COW),
            ),
        )

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 12.0, speed = 3.0) shouldContainExactly listOf(
            EchoHit(sound = Sound.CLIP, clip = 1, delayMs = 667),
            EchoHit(sound = Sound.BIRDS, clip = null, delayMs = 1667),
            EchoHit(sound = Sound.COW, clip = null, delayMs = 2333),
            EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 3333),
        )
    }

    @Test
    fun `every kind sounds as its own sound`() {
        val layout = layoutOf(
            targets = emptyList(),
            noises = NoiseKind.entries.mapIndexed { i, kind -> NoiseSource(cell = Cell(col = i, row = 0), kind = kind) },
        )

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 12.0, speed = 3.0).map { it.sound } shouldContainExactly
            listOf(Sound.BIRDS, Sound.BROOK, Sound.COW, Sound.WIND, Sound.RAIN)
    }

    @Test
    fun `a tie keeps the targets first, then the noises in layout order`() {
        // All three sound after exactly 1 s: the centres sit 3 cells from the ping.
        val layout = layoutOf(
            targets = listOf(Cell(col = 3, row = 0)),
            noises = listOf(
                NoiseSource(cell = Cell(col = 0, row = 3), kind = NoiseKind.BROOK),
                NoiseSource(cell = Cell(col = 3, row = 0), kind = NoiseKind.BIRDS),
            ),
        )

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 12.0, speed = 3.0) shouldContainExactly listOf(
            EchoHit(sound = Sound.CLIP, clip = 0, delayMs = 1000),
            EchoHit(sound = Sound.BROOK, clip = null, delayMs = 1000),
            EchoHit(sound = Sound.BIRDS, clip = null, delayMs = 1000),
        )
    }

    @Test
    fun `a ping that reaches nothing answers with an empty list`() {
        val layout = layoutOf(
            targets = listOf(Cell(col = 19, row = 19)),
            noises = listOf(NoiseSource(cell = Cell(col = 18, row = 19), kind = NoiseKind.WIND)),
        )

        echoOf(x = 0.5, y = 0.5, layout = layout, reach = 12.0, speed = 3.0).shouldBeEmpty()
    }
}
