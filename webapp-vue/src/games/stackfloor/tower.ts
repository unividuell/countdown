/**
 * Hochstapler's tower: where the sliding bar is, what is left once its overhang is cut, and the
 * whole tower from a list of click times. Integer-only.
 *
 * Mirror of `core/src/main/kotlin/org/unividuell/countdown/core/stackfloor/Tower.kt` — change Kotlin
 * first. Both assert `shared/stack-floor/tower.json`.
 */

/**
 * Lengths are integer field units. The bar of floor 0 slides `speedNum / speedDen` units per
 * millisecond; each floor above adds `accelPercent` % of that.
 */
export interface TowerGeometry {
  fieldWidth: number
  startWidth: number
  speedNum: number
  speedDen: number
  accelPercent: number
  maxFloors: number
}

export interface Bar {
  left: number
  width: number
}

/** `bars[0]` is the foundation. */
export interface TowerResult {
  bars: Bar[]
  missed: boolean
}

/** Centred on the field. */
export function foundation(geometry: Pick<TowerGeometry, 'fieldWidth' | 'startWidth'>): Bar {
  return {
    left: Math.floor((geometry.fieldWidth - geometry.startWidth) / 2),
    width: geometry.startWidth,
  }
}

/** Even floors start left and slide right, odd floors the other way round. */
export function fromLeft(floor: number): boolean {
  return floor % 2 === 0
}

/**
 * Left edge of the bar `ms` after its floor began. It bounces between the edges: with
 * `S = fieldWidth - width` it runs `0 → S → 0 → …`, mirrored on odd floors.
 */
export function position(
  geometry: TowerGeometry,
  floor: number,
  width: number,
  ms: number,
): number {
  const span = geometry.fieldWidth - width
  // Below 2^53 for any int ms and floor <= 999: exact in a double.
  const percent = 100 + floor * geometry.accelPercent
  const distance = Math.floor((ms * geometry.speedNum * percent) / (geometry.speedDen * 100))
  const m = distance % (2 * span)
  const p = m <= span ? m : 2 * span - m

  return fromLeft(floor) ? p : span - p
}

/** The part of the bar at `x` that rests on `below`; `null` without overlap (touching is none). */
export function place(below: Bar, x: number, width: number): Bar | null {
  const left = Math.max(below.left, x)
  const right = Math.min(below.left + below.width, x + width)

  return right - left <= 0 ? null : { left, width: right - left }
}

/** Stops at the first miss or at `maxFloors`; later clicks are the caller's business. */
export function buildTower(geometry: TowerGeometry, clicks: readonly number[]): TowerResult {
  const bars: Bar[] = [foundation(geometry)]

  for (const ms of clicks) {
    if (bars.length - 1 >= geometry.maxFloors) break

    const below = bars[bars.length - 1]!
    const x = position(geometry, bars.length - 1, below.width, ms)
    const bar = place(below, x, below.width)
    if (bar === null) return { bars, missed: true }

    bars.push(bar)
  }

  return { bars, missed: false }
}
