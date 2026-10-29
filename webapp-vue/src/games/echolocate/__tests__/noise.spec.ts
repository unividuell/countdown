import { describe, expect, it } from 'vitest'
import {
  BURST_SECONDS,
  REF_RMS,
  bedSamples,
  burstSamples,
  dbToGain,
  levelled,
  rms,
} from '@/games/echolocate/noise'

const KINDS = ['BIRDS', 'WIND', 'RAIN'] as const
const RATES = [44100, 48000]

/** Plain arithmetic, so one assertion covers a quarter million samples. */
function allFinite(samples: Float32Array): boolean {
  return samples.every((s) => Number.isFinite(s))
}

function peak(samples: Float32Array): number {
  return samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0)
}

describe('burstSamples', () => {
  it.each(KINDS.flatMap((kind) => RATES.map((rate) => [kind, rate] as const)))(
    '%s bursts at %i Hz are audible, finite and at the reference loudness',
    (kind, rate) => {
      const burst = burstSamples(kind, rate)

      expect(burst).toHaveLength(Math.round(BURST_SECONDS * rate))
      expect(allFinite(burst)).toBe(true)
      expect(rms(burst)).toBeCloseTo(REF_RMS, 4)
      expect(peak(burst)).toBeGreaterThan(0.01)
    },
  )

  it.each(KINDS)('%s fades in and out, so it neither clicks nor cuts', (kind) => {
    const burst = burstSamples(kind, 48000)

    expect(burst[0]).toBeCloseTo(0, 10)
    expect(burst[burst.length - 1]).toBeCloseTo(0, 10)
  })
})

describe('bedSamples', () => {
  it('loops at the reference loudness', () => {
    const bed = bedSamples(48000)

    expect(bed).toHaveLength(6 * 48000)
    expect(allFinite(bed)).toBe(true)
    expect(rms(bed)).toBeCloseTo(REF_RMS, 4)
    expect(peak(bed)).toBeGreaterThan(0.01)
  })
})

describe('levelled', () => {
  it('levels a quiet clip up to the reference loudness', () => {
    const quiet = Float32Array.from({ length: 1000 }, (_, i) => 0.001 * Math.sin(i / 7))

    expect(rms(levelled(quiet))).toBeCloseTo(REF_RMS, 6)
  })

  it('levels a loud clip down to it', () => {
    const loud = Float32Array.from({ length: 1000 }, (_, i) => 0.9 * Math.sin(i / 7))

    expect(rms(levelled(loud))).toBeCloseTo(REF_RMS, 6)
  })

  it('leaves the clip it was given alone', () => {
    const clip = Float32Array.of(0.01, -0.02, 0.03)

    levelled(clip)

    expect(Array.from(clip)).toEqual([...Float32Array.of(0.01, -0.02, 0.03)])
  })

  it('keeps silence silent rather than dividing by zero', () => {
    const silence = levelled(new Float32Array(100))

    expect(allFinite(silence)).toBe(true)
    expect(peak(silence)).toBe(0)
  })
})

describe('rms', () => {
  it('is the root of the mean square', () => {
    expect(rms(Float32Array.of(3, -3, 3, -3))).toBe(3)
  })

  it('is 0 for nothing at all', () => {
    expect(rms(new Float32Array(0))).toBe(0)
  })
})

describe('dbToGain', () => {
  it('turns decibels into an amplitude factor', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-20)).toBeCloseTo(0.1, 10)
    expect(dbToGain(-24)).toBeCloseTo(0.0631, 4)
    expect(dbToGain(6)).toBeCloseTo(1.995, 3)
  })
})
