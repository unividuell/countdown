package org.unividuell.countdown.core.stackfloor

/** Lengths are integer field units; the bar slides [speedNum]/[speedDen] units per millisecond. */
data class TowerGeometry(
    val fieldWidth: Int,
    val startWidth: Int,
    val speedNum: Int,
    val speedDen: Int,
    val maxFloors: Int,
)

data class Bar(val left: Int, val width: Int)

/** `bars[0]` is the foundation. */
data class TowerResult(val bars: List<Bar>, val missed: Boolean) {
    val height get() = bars.size - 1
}

/**
 * Hochstapler's tower: where the sliding bar is, what is left once its overhang is cut, and the
 * whole tower from a list of click times. Pure and integer-only.
 *
 * Mirrored in `webapp-vue/src/games/stackfloor/tower.ts`; both assert `shared/stack-floor/tower.json`.
 */
object Tower {

    /** Centred on the field. */
    fun foundation(geometry: TowerGeometry): Bar =
        Bar(left = (geometry.fieldWidth - geometry.startWidth) / 2, width = geometry.startWidth)

    /** Even floors start left and slide right, odd floors the other way round. */
    fun fromLeft(floor: Int): Boolean = floor % 2 == 0

    /**
     * Left edge of the bar `ms` after its floor began. It bounces between the edges:
     * with `S = fieldWidth - width` it runs `0 → S → 0 → …`, mirrored on odd floors.
     */
    fun position(geometry: TowerGeometry, floor: Int, width: Int, ms: Int): Int {
        val span = (geometry.fieldWidth - width).toLong()
        val distance = ms.toLong() * geometry.speedNum / geometry.speedDen
        val m = distance % (2 * span)
        val p = if (m <= span) m else 2 * span - m

        return (if (fromLeft(floor)) p else span - p).toInt()
    }

    /** The part of the bar at [x] that rests on [below]; `null` without overlap (touching is none). */
    fun place(below: Bar, x: Int, width: Int): Bar? {
        val left = maxOf(below.left, x)
        val right = minOf(below.left + below.width, x + width)

        return if (right - left <= 0) null else Bar(left = left, width = right - left)
    }

    /** Stops at the first miss or at `maxFloors`; later clicks are the caller's business. */
    fun build(geometry: TowerGeometry, clicks: List<Int>): TowerResult {
        val bars = mutableListOf(foundation(geometry))

        for (ms in clicks) {
            if (bars.size - 1 >= geometry.maxFloors) break

            val below = bars.last()
            val x = position(geometry, floor = bars.size - 1, width = below.width, ms = ms)
            val bar = place(below, x = x, width = below.width)
                ?: return TowerResult(bars = bars, missed = true)

            bars += bar
        }

        return TowerResult(bars = bars, missed = false)
    }
}
