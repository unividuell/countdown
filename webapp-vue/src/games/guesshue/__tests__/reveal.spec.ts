import { describe, expect, it } from 'vitest'
import {
  bandInnerFraction,
  circularDistance,
  layoutGuesses,
  sectorInk,
  sectorPaths,
  stackStep,
  trackFraction,
  unitPoint,
  type RevealGuess,
} from '@/games/guesshue/reveal'

function guess(userId: string, hue: number): RevealGuess {
  return { userId, hue, colorHex: '#3366cc' }
}

describe('lanes', () => {
  it('puts my own guess on the outermost lane, whatever it collides with', () => {
    // Lane 0 is where the pointer knob rode — mine has to land there, or the crossfade from knob
    // to marker is a jump.
    const { markers } = layoutGuesses([guess('other', 12), guess('me', 10)], 'me')

    expect(markers.find((m) => m.userId === 'me')).toMatchObject({ lane: 0, mine: true })
    expect(markers.find((m) => m.userId === 'other')).toMatchObject({ lane: 1, mine: false })
  })

  it('lets two guesses far enough apart share a lane', () => {
    const { markers, deepestLane } = layoutGuesses([guess('me', 0), guess('other', 30)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 0])
    expect(deepestLane).toBe(0)
  })

  it('treats exactly the collision window as far enough apart', () => {
    const { markers } = layoutGuesses([guess('me', 0), guess('other', 10)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 0])
  })

  it('stacks across the 0° seam, which is not a special case but a consequence', () => {
    // The original compared raw bounds and stacked nothing across 0°; distance on the circle makes
    // the seam disappear from the code entirely.
    const { markers } = layoutGuesses([guess('me', 358), guess('other', 3)], 'me')

    expect(markers.map((m) => m.lane)).toEqual([0, 1])
  })

  it('fills the lowest free lane rather than one per guess', () => {
    const { markers, deepestLane } = layoutGuesses(
      [guess('me', 100), guess('a', 102), guess('b', 200)],
      'me',
    )

    expect(markers.find((m) => m.userId === 'b')!.lane).toBe(0)
    expect(deepestLane).toBe(1)
  })

  it('orders equal angles by user id, so a reload draws the same picture', () => {
    const first = layoutGuesses([guess('b', 40), guess('a', 40)], null)
    const second = layoutGuesses([guess('a', 40), guess('b', 40)], null)

    expect(first.markers.map((m) => m.userId)).toEqual(['a', 'b'])
    expect(second.markers.map((m) => m.userId)).toEqual(['a', 'b'])
    expect(first.markers.map((m) => m.lane)).toEqual([0, 1])
  })

  it('works with nobody of my own in the list', () => {
    const { markers } = layoutGuesses([guess('a', 10), guess('b', 12)], null)

    expect(markers.every((m) => !m.mine)).toBe(true)
    expect(markers.map((m) => m.lane)).toEqual([0, 1])
  })
})

describe('radii', () => {
  it('drops each lane by one step, and the band by the same step', () => {
    // The same subtraction for both is why every marker sits on colour with the same margin
    // instead of beside it.
    expect(trackFraction(0, 2)).toBeCloseTo(0.89, 10)
    expect(trackFraction(1, 2)).toBeCloseTo(0.79, 10)
    expect(trackFraction(2, 2)).toBeCloseTo(0.69, 10)
    expect(bandInnerFraction(2)).toBeCloseTo(0.58, 10)
  })

  it('leaves the band alone when nothing collides', () => {
    expect(bandInnerFraction(0)).toBeCloseTo(0.78, 10)
    expect(stackStep(0)).toBeCloseTo(0.1, 10)
  })

  it('shrinks the step instead of closing the hole, from six lanes on', () => {
    // Five lanes still fit at the full step; the sixth would push the band past the floor, so the
    // markers overlap more and the wheel stays a wheel.
    expect(stackStep(5)).toBeCloseTo(0.1, 10)
    expect(bandInnerFraction(5)).toBeCloseTo(0.28, 10)

    expect(stackStep(6)).toBeCloseTo(0.53 / 6, 10)
    expect(bandInnerFraction(6)).toBeCloseTo(0.25, 10)
    expect(bandInnerFraction(11)).toBeCloseTo(0.25, 10)
  })

  it('keeps the deepest marker on the band at any depth', () => {
    for (const deepest of [0, 1, 5, 6, 11]) {
      expect(trackFraction(deepest, deepest) - bandInnerFraction(deepest)).toBeCloseTo(0.11, 10)
    }
  })
})

describe('circularDistance', () => {
  it('measures the short way round', () => {
    expect(circularDistance(10, 20)).toBe(10)
    expect(circularDistance(358, 3)).toBe(5)
    expect(circularDistance(0, 180)).toBe(180)
    expect(circularDistance(-5, 5)).toBe(10)
  })
})

describe('the sector', () => {
  it('places a point clockwise from the top, like the ring', () => {
    expect(unitPoint(0, 1).x).toBeCloseTo(0.5, 10)
    expect(unitPoint(0, 1).y).toBeCloseTo(0, 10)
    expect(unitPoint(90, 1).x).toBeCloseTo(1, 10)
    expect(unitPoint(90, 1).y).toBeCloseTo(0.5, 10)
    expect(unitPoint(180, 1).y).toBeCloseTo(1, 10)
    expect(unitPoint(270, 1).x).toBeCloseTo(0, 10)
    expect(unitPoint(90, 0.78).x).toBeCloseTo(0.89, 10)
  })

  it('draws the window as two boundary lines closed by two arcs, over the band only', () => {
    // Chosen so every coordinate is exact: the window runs from 0° to 180°, the band from 0.78.
    const { window } = sectorPaths(90, 90, 0.78)

    expect(window).toBe(
      'M 0.5,0.11 L 0.5,0 M 0.5,0.89 L 0.5,1 ' +
        'M 0.5,0.11 A 0.39,0.39 0 0,1 0.5,0.89 M 0.5,0 A 0.5,0.5 0 0,1 0.5,1',
    )
  })

  it('draws the solution as a single line, over the band only', () => {
    expect(sectorPaths(90, 90, 0.78).solution).toBe('M 0.89,0.5 L 1,0.5')
  })

  it('needs no special case for a window that runs across 0°', () => {
    expect(sectorPaths(355, 10, 0.78)).toEqual(sectorPaths(-5, 10, 0.78))
    expect(sectorPaths(355, 10, 0.78).window).toContain('0 0,1')
  })

  it('draws only the solution line at zero tolerance', () => {
    const { window, solution } = sectorPaths(90, 0, 0.78)

    expect(window).toBeNull()
    expect(solution).toBe('M 0.89,0.5 L 1,0.5')
  })

  it('follows the band inward as it grows', () => {
    expect(sectorPaths(90, 90, 0.5).solution).toBe('M 0.75,0.5 L 1,0.5')
  })

  it('spans the intended window rather than its complement when the tolerance exceeds 90°', () => {
    // Every other case here keeps the span at or under 180°, so the large-arc-flag's `1` branch
    // never ran. Boundaries at 0° and 270° keep every coordinate exact even past that: target 135°
    // with a 135° tolerance is a plausible "very easy" round, and the arc must sweep the 270°
    // window through 135° — not the 90° gap on the other side of the circle.
    const { window } = sectorPaths(135, 135, 0.78)

    expect(window).toContain('1,1') // large-arc-flag set — the ≤180° cases above carry `0,1`
    expect(window).toBe(
      'M 0.5,0.11 L 0.5,0 M 0.11,0.5 L 0,0.5 ' +
        'M 0.5,0.11 A 0.39,0.39 0 1,1 0.11,0.5 M 0.5,0 A 0.5,0.5 0 1,1 0,0.5',
    )
  })
})

describe('sectorInk', () => {
  it('goes dark on a bright solution and light on a dark one', () => {
    expect(sectorInk(60, 0.9, 0.5)).toBe('#111111')
    expect(sectorInk(240, 0.9, 0.4)).toBe('#ffffff')
  })

  it('reads the angle, not just the lightness', () => {
    // Yellow and blue at the same HSL lightness are nowhere near equally bright, which is why the
    // decision goes through a real conversion rather than through `lightness > 0.5`.
    expect(sectorInk(60, 0.9, 0.45)).not.toBe(sectorInk(240, 0.9, 0.45))
  })
})
