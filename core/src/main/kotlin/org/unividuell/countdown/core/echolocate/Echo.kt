package org.unividuell.countdown.core.echolocate

import kotlin.math.roundToInt

enum class Sound { CLIP, BIRDS, BROOK, COW, WIND, RAIN }

/** [clip] is the clip's place in the round's clip list for [Sound.CLIP], otherwise `null`. */
data class EchoHit(val sound: Sound, val clip: Int?, val delayMs: Int)

/**
 * What a ping at ([x], [y]) hears: every source within [reach] cells, each after distance / [speed].
 * e.g. a ping 5 cells from a clip at 3 cells/s → the clip sounds after 1667 ms.
 *
 * Sorted by delay. A tie keeps the order of the draw — clips first, then the noise as laid out —
 * because `sortedBy` is stable; the answer must not depend on anything else.
 */
fun echoOf(x: Double, y: Double, layout: Layout, reach: Double, speed: Double): List<EchoHit> {
    val ping = Pin(x = x, y = y)

    fun hit(cell: Cell, sound: Sound, clip: Int?): EchoHit? {
        val distance = distanceToCentre(pin = ping, cell = cell)

        return if (distance <= reach) {
            EchoHit(sound = sound, clip = clip, delayMs = (distance / speed * 1000).roundToInt())
        } else {
            null
        }
    }

    val clips = layout.targets.mapIndexedNotNull { i, cell -> hit(cell = cell, sound = Sound.CLIP, clip = i) }
    val noises = layout.noises.mapNotNull { hit(cell = it.cell, sound = it.kind.sound(), clip = null) }

    return (clips + noises).sortedBy { it.delayMs }
}

private fun NoiseKind.sound(): Sound = when (this) {
    NoiseKind.BIRDS -> Sound.BIRDS
    NoiseKind.BROOK -> Sound.BROOK
    NoiseKind.COW -> Sound.COW
    NoiseKind.WIND -> Sound.WIND
    NoiseKind.RAIN -> Sound.RAIN
}
