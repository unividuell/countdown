import { describe, expect, it } from 'vitest'
import { CHARGE_HZ, RAMP, chargeCurve, chargeKnocks, chargeTimeOf, sparkRate } from '../charge'

describe('chargeCurve', () => {
  it('starts and ends where the hold does', () => {
    expect(chargeCurve(0)).toBe(0)
    expect(chargeCurve(1)).toBeCloseTo(1)
  })

  it('starts slow: a tenth of the time fills about a hundredth of the ring', () => {
    expect(chargeCurve(0.1)).toBeCloseTo(0.0133, 3)
  })

  it('runs at one constant speed after the ramp', () => {
    const speed = (from: number) => (chargeCurve(from + 0.1) - chargeCurve(from)) / 0.1

    expect(speed(RAMP)).toBeCloseTo(speed(0.8))
    expect(speed(RAMP)).toBeCloseTo(4 / 3)
  })

  it('has no jump in speed where the ramp ends', () => {
    const before = (chargeCurve(RAMP) - chargeCurve(RAMP - 1e-4)) / 1e-4
    const after = (chargeCurve(RAMP + 1e-4) - chargeCurve(RAMP)) / 1e-4

    expect(before).toBeCloseTo(after, 2)
  })

  it('stays on the ring outside the hold', () => {
    expect(chargeCurve(-0.2)).toBe(0)
    expect(chargeCurve(1.3)).toBe(1)
  })
})

describe('chargeTimeOf', () => {
  it('is the curve read backwards', () => {
    for (const time of [0, 0.1, 0.3, RAMP, 0.7, 1]) {
      expect(chargeTimeOf(chargeCurve(time))).toBeCloseTo(time)
    }
  })
})

describe('CHARGE_HZ', () => {
  it('runs up C major over three octaves, C4 to C7', () => {
    expect(CHARGE_HZ).toHaveLength(22)
    expect(CHARGE_HZ[0]).toBeCloseTo(261.63)
    // E4, then the octaves.
    expect(CHARGE_HZ[2]).toBeCloseTo(329.63, 1)
    expect(CHARGE_HZ[7]).toBeCloseTo(523.25, 1)
    expect(CHARGE_HZ.at(-1)).toBeCloseTo(2093.04, 1)
  })
})

describe('chargeKnocks', () => {
  const knocks = chargeKnocks()

  it('climbs the scale, one knock per equal piece of the ring', () => {
    expect(knocks.map(({ hz }) => hz)).toEqual(CHARGE_HZ)
    expect(knocks.map(({ time }) => chargeCurve(time))).toEqual(
      CHARGE_HZ.map((_, i) => expect.closeTo(i / (CHARGE_HZ.length - 1))),
    )
  })

  it('knocks with the press and with the full ring', () => {
    expect(knocks[0]!.time).toBe(0)
    expect(knocks.at(-1)!.time).toBeCloseTo(1)
  })

  it('gathers pace, then keeps an even beat', () => {
    const gaps = knocks.slice(1).map((knock, i) => knock.time - knocks[i]!.time)

    expect(gaps[0]).toBeGreaterThan(gaps[1]!)
    expect(gaps[1]).toBeGreaterThan(gaps[2]!)
    expect(gaps.at(-1)).toBeCloseTo(gaps.at(-2)!)
  })
})

describe('sparkRate', () => {
  it('throws none on an empty ring and the most on a full one', () => {
    expect(sparkRate(0)).toBe(0)
    expect(sparkRate(0.5)).toBeCloseTo(sparkRate(1) / 2)
  })
})
