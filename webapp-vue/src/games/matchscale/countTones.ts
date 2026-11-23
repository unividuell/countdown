/**
 * The count the reveal plays while the true B grows from my tip to the factor: one short tone per
 * fine pitch step, each step as large as one step of B's size, so the pitch climbs as far as B
 * grows (B ×2 ≈ an octave). Rising when B grows, falling when it shrinks. An even 58 ms tick that
 * brakes towards the end; B's growth rides the same ticks (`growEasing`).
 *
 *   B ×2:   ♪♪♪♪♪♪♪♪♪♪♪♪♪ ♪ ♪  ♪   ♪     17 tones, rising, ≈ 1.2 s
 *           0 ─────────────────────────▶ last tick = B arrives
 *
 * Tuned by ear on a throwaway page. Pure: the graph plays it (`countSound.ts`).
 */

/** Semitones per tick. */
export const STEP_SEMITONES = 0.7
/** Frequency ratio per tick, and the size ratio of B it stands for. */
export const STEP = 2 ** (STEP_SEMITONES / 12)
export const MAX_TICKS = 26
export const TICK_S = 0.058
/** How much longer the last gap is than the first: `1 + BRAKE`. */
export const BRAKE = 1.4
export const BASE_HZ = 400

/** A lone tick has no span to ride; B still eases in briefly. */
export const SINGLE_TICK_GROW_MS = 150

export interface Tone {
  /** Seconds after the growth starts. */
  atS: number
  hz: number
}

/** One tick per `STEP` of B's size, 1..`MAX_TICKS`. */
export function tickCount(tip: number, factor: number): number {
  const ticks = Math.round(Math.abs(Math.log(factor / tip)) / Math.log(STEP))

  return Math.min(Math.max(ticks, 1), MAX_TICKS)
}

/** The first at 0, then `TICK_S` gaps that stretch by up to `BRAKE` towards the end (u³). */
export function tickTimes(count: number): number[] {
  const times: number[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    times.push(at)
    const u = count > 1 ? i / (count - 1) : 1
    at += TICK_S * (1 + BRAKE * u ** 3)
  }

  return times
}

/** `count` steps up from `BASE_HZ`, or the same steps down to it. */
export function pitches(count: number, rising: boolean): number[] {
  const up = Array.from({ length: count }, (_, i) => BASE_HZ * STEP ** i)

  return rising ? up : up.reverse()
}

/** After the last tick, a breath, then the verdict. */
export const FINALE_GAP_S = 0.07

/** When the verdict falls, from the count's first tone: the last tone and the breath after it. */
export function countEndsInMs(tones: readonly Tone[]): number {
  const last = tones.at(-1)

  return last === undefined ? 0 : (last.atS + FINALE_GAP_S) * 1000
}

/** The whole count for B growing from `tip` to `factor`. */
export function countTones(tip: number, factor: number): Tone[] {
  const count = tickCount(tip, factor)
  const hzs = pitches(count, factor >= tip)

  return tickTimes(count).map((atS, i) => ({ atS, hz: hzs[i]! }))
}

/** How long B grows: until the last tick. */
export function growMs(tones: readonly Tone[]): number {
  return tones.length > 1 ? tones.at(-1)!.atS * 1000 : SINGLE_TICK_GROW_MS
}

/**
 * B's growth as a CSS easing: tick `i` of `n` at `i / (n − 1)` of the way, so each tone sounds as
 * B passes it. B ×2: `linear(0 0%, 0.0625 4.78%, …, 1 100%)`.
 */
export function growEasing(tones: readonly Tone[]): string {
  if (tones.length < 2) return 'ease-out'

  const total = tones.at(-1)!.atS
  const stops = tones.map(
    (tone, i) => `${round(i / (tones.length - 1))} ${round((tone.atS / total) * 100)}%`,
  )

  return `linear(${stops.join(', ')})`
}

function round(x: number): number {
  return Math.round(x * 1e4) / 1e4
}
