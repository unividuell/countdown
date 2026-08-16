/**
 * The reveal wheel's arithmetic. Pure, and kept out of the components for the same reason
 * `geometry.ts` is: happy-dom computes no layout, so lanes, radii and path data could not be
 * asserted on from inside a mounted component — here they are ordinary arithmetic.
 */
import { readableTextColor } from '@/ui/readableTextColor'
import { hslToHex } from './color'
import { wrap360 } from './geometry'
import { BAND_INNER_FRACTION, KNOB_TRACK_FRACTION } from './wheel'

/** One guess to place, already narrowed to numbers by whoever read it off the wire. */
export interface RevealGuess {
  userId: string
  hue: number
  /** The guesser's avatar colour — the marker's fill. */
  colorHex: string
  /**
   * When this marker fades in. Computed by `GuessHueGame` from the scoreboard's ranking, so the
   * marker and its row are one event — the wheel keeps no timetable of its own.
   */
  revealDelayMs: number
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
 * The four beats of the reveal, from the moment the reveal card is inserted. Beat 1 is a CSS
 * transition in the components (the centre button leaving the outgoing card at 0 ms over 200 ms),
 * beat 2 the card crossfade at ~200 ms; the numbers below drive beats 3 and 4 — the tolerance
 * sector and the scoreboard's head at [SECTOR_DELAY_MS], then the results: every row of the table
 * and, with it, its marker on the wheel. They are a first proposal and belong in the lab to be
 * turned — that is what it is for.
 */
export const SECTOR_DELAY_MS = 900
export const RESULTS_DELAY_MS = 1900
export const FADE_MS = 300
export const BAND_GROW_MS = 700

/** Beat 3 writes the scoreboard's head at the same moment the sector fades in. */
export const HEAD_DELAY_MS = SECTOR_DELAY_MS

/** Between the columns of one row — the typewriter's step. */
export const CELL_STAGGER_MS = 45

/**
 * Between rows. Deliberately shorter than a row is wide (3 · [CELL_STAGGER_MS]), so the cascades
 * overlap and the table flows instead of stuttering row by row.
 */
export const ROW_STAGGER_MS = 120

/** The row cascade never runs longer than this, however many people played. */
export const TYPE_BUDGET_MS = 1200

/** The column a marker rides with: the guess cell, because both are „the guess as a colour“. */
export const TIP_COLUMN = 1

/**
 * How far apart two rows are. [ROW_STAGGER_MS] below the budget, and whatever fits above it — the
 * same „compress rather than grow“ shape [stackStep] gives the marker lanes.
 */
export function rowStagger(rowCount: number): number {
  return Math.min(ROW_STAGGER_MS, TYPE_BUDGET_MS / Math.max(1, rowCount))
}

/** A cell of the scoreboard's head: three rows (heading, solution value, band), four columns. */
export function headCellDelayMs(row: number, column: number): number {
  return HEAD_DELAY_MS + row * ROW_STAGGER_MS + column * CELL_STAGGER_MS
}

/**
 * A cell of the scoreboard's body — and, at [TIP_COLUMN], the matching marker on the wheel. One
 * function for both is the whole point of the coupling: there is no second timetable to drift.
 */
export function cellDelayMs(tick: number, column: number, rowCount: number): number {
  return RESULTS_DELAY_MS + tick * rowStagger(rowCount) + column * CELL_STAGGER_MS
}

/**
 * Which tick a row borrows its timing from. Every row rides its own rank — except the viewer's.
 *
 * My marker has been on the wheel since the crossfade (it is the knob, recoloured), so a row
 * appearing with it would say „I am not the best“ from its slot alone, before the picture had
 * shown a single rival guess. Mine therefore waits for the first foreign marker: that is rank 1
 * when I am rank 0, and rank 0 otherwise. Alone in the round there is nothing to give away.
 */
export function tickOfRow(rank: number, myRank: number | null, rowCount: number): number {
  if (myRank === null || rank !== myRank) return rank
  if (rowCount <= 1) return 0
  return myRank === 0 ? 1 : 0
}

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
  /**
   * The dashed window: two boundary lines and the two arcs that close them. `null` at zero
   * tolerance, and `null` again once the half-window reaches 180° — a window that wide has no
   * boundary left to draw, the whole circle counts.
   */
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

  // A half-window of 180° or more covers the whole circle: there is no boundary left to draw, the
  // same picture as zero tolerance. Below 180° the window's actual clockwise sweep from
  // `target − toleranceDeg` to `target + toleranceDeg` is `2 · toleranceDeg`, but clamping that
  // span to 360° (as the code used to) keeps the large-arc-flag's `1` past 90° while the arc
  // endpoints keep moving with the true, unclamped span — so the two boundary points end up
  // closer together than 180° apart while the flag says "go the long way", and the arc is drawn
  // the wrong way round: it closes the small gap between the endpoints instead of sweeping the
  // large window between them. At exactly 180° the two endpoints coincide and SVG drops the
  // zero-length arc entirely, leaving two radial lines and no closed window at all. `toleranceDeg`
  // is a number `GuessHueTolerance.DEGREES` documents the backend as free to change without a
  // frontend release, so this has to be correct for any finite value, not just the values in use
  // today.
  if (toleranceDeg >= 180) return { window: null, solution }

  const from = targetHue - toleranceDeg
  const to = targetHue + toleranceDeg
  const span = toleranceDeg * 2
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
