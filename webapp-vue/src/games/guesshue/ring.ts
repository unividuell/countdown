/**
 * The painted rainbow band, as one style object.
 *
 * Lifted out of `HueWheelInput.vue` because both wheels — the one that takes input and the one
 * that shows the result — paint exactly the same ring, and because a mask string composed by hand
 * is worth asserting on without mounting anything.
 */
import type { CSSProperties } from 'vue'

/** The entrance: how much of the ring is painted so far, and where the painting started. */
export interface RingSweep {
  fromDeg: number
  paintedDeg: number
}

export interface RingOptions {
  /** 0 … 1, as the payload carries them. */
  saturation: number
  lightness: number
  /** The band's inner edge, as a fraction of the wheel's radius. */
  innerFraction: number
  /** `null` — or a full turn — paints the whole ring. */
  sweep: RingSweep | null
}

/**
 * The outline's width, as a fraction of the wheel's radius: about 1px on a phone-wide wheel. The
 * band's inner edge fades in over exactly this width, so the inner line covers the fade:
 *
 *        fade    band
 *   ░░░░▒▒▒▒████████████   edge − w … edge   the band's mask ramp
 *       ││││                inner line, w wide, centred on the ramp
 */
export const OUTLINE_FRACTION = 0.006

/** Radii of the two outline circles and their stroke width, all as fractions of the radius. */
export interface RingOutline {
  outer: number
  inner: number
  width: number
}

/** Hundredths of a percent hold every edge the band is ever driven to; more is IEEE754 noise. */
const tidy = (n: number): number => Math.round(n * 10000) / 10000

/** The band's inner edge in percent, rounded as the mask needs it. */
const edgePct = (innerFraction: number): number => Math.round(innerFraction * 1000) / 10

export function ringOutline(innerFraction: number): RingOutline {
  return {
    outer: tidy(1 - OUTLINE_FRACTION / 2),
    inner: tidy(edgePct(innerFraction) / 100 - OUTLINE_FRACTION / 2),
    width: OUTLINE_FRACTION,
  }
}

/** The entrance's mask — `null` once the whole ring is painted. Shared by band and outline. */
export function sweepMask(sweep: RingSweep | null): string | null {
  return sweep && sweep.paintedDeg < 360
    ? `conic-gradient(from ${sweep.fromDeg}deg, #000 0deg ${sweep.paintedDeg}deg, transparent 0deg)`
    : null
}

export function ringStyle({
  saturation,
  lightness,
  innerFraction,
  sweep,
}: RingOptions): CSSProperties {
  const s = `${saturation * 100}%`
  const l = `${lightness * 100}%`
  // Rounded to a tenth of a percent: the inner edge is driven frame by frame while the band grows,
  // and 0.78 - 0.1 answers 0.6799999999999999 in IEEE754, which would otherwise reach the mask as
  // a fifteen-digit string.
  const edge = edgePct(innerFraction)
  const fadeFrom = Math.round((edge - OUTLINE_FRACTION * 100) * 10) / 10
  const sweeping = sweepMask(sweep)
  // The band itself: everything inside the inner edge is cut away, turning the disc into a ring.
  // Composed with the sweep mask above rather than replacing it, so the entrance still paints the
  // band progressively instead of revealing a full disc that only narrows once it is done.
  const bandMask = `radial-gradient(closest-side, transparent ${fadeFrom}%, #000 ${edge}%)`
  const mask = sweeping ? `${sweeping}, ${bandMask}` : bandMask
  return {
    // An array of values is Vue's fallback idiom: it writes them in order and the last one the
    // browser accepts survives. Without hue interpolation the stepped ring stands — which is what
    // the original shipped, only with nine stops instead of thirteen, and it banded visibly.
    // csstype (which Vue's CSSProperties is built on) has no notion of this idiom, so the array
    // needs the cast — the runtime behaviour is Vue's, not a workaround.
    backgroundImage: [
      `conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${s} ${l})`).join(',')})`,
      `conic-gradient(in hsl longer hue, hsl(0 ${s} ${l}), hsl(360 ${s} ${l}))`,
    ] as unknown as string,
    mask,
    WebkitMask: mask,
    // Two mask layers default to `add` (a union) — `intersect` is what turns "painted so far" AND
    // "inside the band" into the actual visible region; without it the sweep would go on painting
    // the disc's dead centre too, band or no band. csstype has no `maskComposite` entry either.
    ...(sweeping
      ? ({
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        } as unknown as CSSProperties)
      : {}),
  } satisfies CSSProperties
}
