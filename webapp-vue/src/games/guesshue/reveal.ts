/**
 * The reveal wheel's arithmetic. Pure, and kept out of the components for the same reason
 * `geometry.ts` is: happy-dom computes no layout, so lanes, radii and path data could not be
 * asserted on from inside a mounted component — here they are ordinary arithmetic.
 */
import { readableTextColor } from '@/ui/readableTextColor'
import { wrap360 } from './geometry'
import { BAND_INNER_FRACTION, KNOB_TRACK_FRACTION } from './wheel'

/** One guess to place, already narrowed to numbers by whoever read it off the wire. */
export interface RevealGuess {
  userId: string
  hue: number
  /** The guesser's avatar colour — the marker's fill. */
  colorHex: string
}

export interface PlacedGuess extends RevealGuess {
  /** 0 is the outermost lane — the one the input wheel's knob rode. */
  lane: number
  /** The marker's centre, as a fraction of the wheel's radius. */
  trackFraction: number
  /** Mine arrives out of the knob rather than fading in with the rest. */
  mine: boolean
}

export interface RevealLayout {
  markers: PlacedGuess[]
  /** The deepest lane in use; 0 when nothing collides. */
  deepestLane: number
  /** Where the band ends once it has grown inward far enough to carry that lane. */
  bandInnerFraction: number
}

/** How far each lane sits inside the one above it, as a fraction of the wheel's radius. */
export const STACK_STEP = 0.1

/**
 * Two guesses closer than this on the circle go on separate lanes. A lane-0 marker covers about
 * 11.6° itself (`2 · asin(0.09 / 0.89)`), so this sits deliberately just under a full overlap:
 * touching at the edges stays readable, and every degree more makes stacks deeper than they need
 * to be. Turn it in the lab, against real rounds.
 */
export const COLLISION_WINDOW_DEG = 10

/** The band never gets narrower than this — a wheel whose hole has closed is not a wheel. */
export const MIN_BAND_INNER_FRACTION = 0.25

/**
 * The four beats of the reveal, from the moment the reveal card is inserted. Two of them are CSS
 * transitions in the components (the card crossfade at ~200 ms, and the centre button leaving the
 * outgoing card at 0 ms over 200 ms); the three numbers below drive everything the reveal wheel
 * does to itself. They are a first proposal and belong in the lab to be turned — that is what it
 * is for.
 */
export const SECTOR_DELAY_MS = 900
export const MARKERS_DELAY_MS = 1900
export const MARKER_STAGGER_MS = 90
export const FADE_MS = 300
export const BAND_GROW_MS = 700

/**
 * How far each lane sits inside the previous one. Below the floor this is [STACK_STEP]; from six
 * lanes on it is whatever room is actually left, so the stack compresses instead of the hole
 * closing. Expressed as remaining room rather than as a lane count, so it stays correct if any of
 * the three constants above moves.
 */
export function stackStep(deepestLane: number): number {
  if (deepestLane <= 0) return STACK_STEP
  return Math.min(STACK_STEP, (BAND_INNER_FRACTION - MIN_BAND_INNER_FRACTION) / deepestLane)
}

/** The centre of a marker on [lane], given how deep the deepest stack goes. */
export function trackFraction(lane: number, deepestLane: number): number {
  return KNOB_TRACK_FRACTION - lane * stackStep(deepestLane)
}

/**
 * The band's inner edge for a stack that deep. The same subtraction as [trackFraction] — that is
 * why every marker sits on colour with the same margin instead of beside it, and why nothing
 * happens to the band at all when nothing collides.
 */
export function bandInnerFraction(deepestLane: number): number {
  return BAND_INNER_FRACTION - deepestLane * stackStep(deepestLane)
}

/**
 * Distance between two angles along the circle — `min(|a−b|, 360−|a−b|)`. The 0° seam is not a
 * special case here, it falls out of the formula; the original compared raw bounds and therefore
 * stacked nothing across it.
 */
export function circularDistance(a: number, b: number): number {
  const raw = Math.abs(wrap360(a) - wrap360(b))
  return Math.min(raw, 360 - raw)
}

/**
 * Every guess on a lane. Mine always on lane 0 — otherwise the marker no longer covers the knob it
 * grows out of; the rest sorted by angle (ties by user id, so the picture survives a reload) and
 * greedily given the lowest lane with no neighbour inside [COLLISION_WINDOW_DEG].
 */
export function layoutGuesses(guesses: RevealGuess[], mineUserId: string | null): RevealLayout {
  const mine = mineUserId === null ? undefined : guesses.find((g) => g.userId === mineUserId)
  const others = guesses
    .filter((g) => g.userId !== mineUserId)
    .sort((a, b) => wrap360(a.hue) - wrap360(b.hue) || a.userId.localeCompare(b.userId))

  /** The angles already placed, per lane. Sparse until a lane is actually used. */
  const taken: number[][] = []
  function claim(hue: number): number {
    for (let lane = 0; ; lane++) {
      const neighbours = taken[lane] ?? []
      if (neighbours.every((other) => circularDistance(other, hue) >= COLLISION_WINDOW_DEG)) {
        taken[lane] = [...neighbours, hue]
        return lane
      }
    }
  }

  const placed: { guess: RevealGuess; lane: number; mine: boolean }[] = []
  if (mine) {
    taken[0] = [wrap360(mine.hue)]
    placed.push({ guess: mine, lane: 0, mine: true })
  }
  for (const guess of others) {
    placed.push({ guess, lane: claim(wrap360(guess.hue)), mine: false })
  }

  const deepestLane = placed.reduce((deepest, entry) => Math.max(deepest, entry.lane), 0)
  return {
    markers: placed.map((entry) => ({
      ...entry.guess,
      lane: entry.lane,
      mine: entry.mine,
      trackFraction: trackFraction(entry.lane, deepestLane),
    })),
    deepestLane,
    bandInnerFraction: bandInnerFraction(deepestLane),
  }
}

export interface SectorPaths {
  /** The dashed window: two boundary lines and the two arcs that close them. `null` at zero tolerance. */
  window: string | null
  /** The solid line at the solution itself. */
  solution: string
}

/**
 * A point on the wheel in the sector SVG's unit box: centre at (0.5, 0.5), the wheel's edge at
 * radius 0.5. Angles run clockwise from the top, the same origin and direction as the ring's
 * `conic-gradient`, so nothing here needs an offset.
 */
export function unitPoint(angleDeg: number, radiusFraction: number): { x: number; y: number } {
  const rad = ((wrap360(angleDeg) - 90) * Math.PI) / 180
  const r = radiusFraction / 2
  return { x: 0.5 + r * Math.cos(rad), y: 0.5 + r * Math.sin(rad) }
}

/**
 * The window and the solution as two separate paths, because the whole key to reading the picture
 * is that dashed means boundary and solid means solution.
 *
 * Both reach only across the band, from [innerFraction] to the wheel's edge: the hole stays empty.
 * The original drew its boundary lines all the way into the centre.
 */
export function sectorPaths(
  targetHue: number,
  toleranceDeg: number,
  innerFraction: number,
): SectorPaths {
  const radial = (angle: number): string => {
    const inner = unitPoint(angle, innerFraction)
    const outer = unitPoint(angle, 1)
    return `M ${fmt(inner.x)},${fmt(inner.y)} L ${fmt(outer.x)},${fmt(outer.y)}`
  }
  const arc = (radiusFraction: number, from: number, to: number, spanDeg: number): string => {
    const a = unitPoint(from, radiusFraction)
    const b = unitPoint(to, radiusFraction)
    const r = fmt(radiusFraction / 2)
    // Sweep 1 is SVG's positive angle direction, which with y growing downwards is clockwise on
    // screen — the same direction the angles above run in.
    return `M ${fmt(a.x)},${fmt(a.y)} A ${r},${r} 0 ${spanDeg > 180 ? 1 : 0},1 ${fmt(b.x)},${fmt(b.y)}`
  }

  const solution = radial(targetHue)
  if (toleranceDeg <= 0) return { window: null, solution }

  const from = targetHue - toleranceDeg
  const to = targetHue + toleranceDeg
  const span = Math.min(360, toleranceDeg * 2)
  return {
    window: [
      radial(from),
      radial(to),
      arc(innerFraction, from, to, span),
      arc(1, from, to, span),
    ].join(' '),
    solution,
  }
}

/** Four decimals: past what a 320 px wheel can show, and short enough to keep a path readable. */
function fmt(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

/**
 * Ink that stays readable against the solution colour — the same idea as the original's
 * `readableColor`, with our own helper.
 */
export function sectorInk(hue: number, saturation: number, lightness: number): string {
  return readableTextColor(hslToHex(hue, saturation, lightness))
}

/**
 * The bridge to [readableTextColor], which parses hex and nothing else. Needed because yellow and
 * blue at the same HSL lightness are nowhere near equally bright, so the decision cannot be made
 * from `lightness` alone.
 */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = wrap360(hue) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const rgb: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  const [r, g, b] = rgb
  const base = lightness - chroma / 2
  const channel = (value: number): string =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}
