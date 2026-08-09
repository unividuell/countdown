/**
 * The painted rainbow band, as one style object.
 *
 * Lifted out of `HueWheel.vue` because both wheels — the one that takes input and the one that
 * shows the result — paint exactly the same ring, and because a mask string composed by hand is
 * worth asserting on without mounting anything.
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
  const edge = Math.round(innerFraction * 1000) / 10
  const sweepMask =
    sweep && sweep.paintedDeg < 360
      ? `conic-gradient(from ${sweep.fromDeg}deg, #000 0deg ${sweep.paintedDeg}deg, transparent 0deg)`
      : null
  // The band itself: everything inside the inner edge is cut away, turning the disc into a ring.
  // Composed with the sweep mask above rather than replacing it, so the entrance still paints the
  // band progressively instead of revealing a full disc that only narrows once it is done.
  const bandMask = `radial-gradient(closest-side, transparent ${edge - 1}%, #000 ${edge}%)`
  const mask = sweepMask ? `${sweepMask}, ${bandMask}` : bandMask
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
    ...(sweepMask
      ? ({
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        } as unknown as CSSProperties)
      : {}),
  } satisfies CSSProperties
}
