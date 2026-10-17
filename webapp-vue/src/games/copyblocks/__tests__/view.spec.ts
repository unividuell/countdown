import { describe, expect, it } from 'vitest'
import {
  SPIN_MS,
  START_CAMERA,
  centred,
  isCentred,
  spunYaw,
  zoomedAt,
} from '@/games/copyblocks/view'
import type { Camera } from '@/games/copyblocks/view'

describe('spunYaw', () => {
  it('starts and ends where it began, half way round at half time', () => {
    expect(spunYaw(0.6, 0)).toBe(0.6)
    expect(spunYaw(0.6, SPIN_MS / 2)).toBeCloseTo(0.6 + Math.PI)
    expect(spunYaw(0.6, SPIN_MS)).toBe(0.6)
    expect(spunYaw(0.6, 2 * SPIN_MS)).toBe(0.6)
  })

  it('only ever turns one way', () => {
    let last = -Infinity
    for (let ms = 0; ms < SPIN_MS; ms += 50) {
      const yaw = spunYaw(0, ms)
      expect(yaw).toBeGreaterThanOrEqual(last)
      last = yaw
    }
  })
})

describe('zoomedAt', () => {
  const CENTRE = [3, 3, 3] as const
  const BOUNDS = { lo: [0, 0, 0], hi: [6, 6, 6] } as const
  const zoomed = (camera: Camera, factor: number, anchor: readonly [number, number, number]) =>
    zoomedAt(camera, factor, anchor, CENTRE, BOUNDS)

  it('zooms about the orbit point when that is what lies under the cursor', () => {
    expect(zoomed(START_CAMERA, 0.5, CENTRE)).toEqual({
      ...START_CAMERA,
      zoom: 0.5,
      target: CENTRE,
    })
  })

  it('draws the orbit point towards the cursor by the zoom step, so that point stays put', () => {
    const closer = zoomed(START_CAMERA, 0.5, [5, 0, 5])

    expect(closer.zoom).toBe(0.5)
    expect(closer.target).toEqual([4, 1.5, 4])
    expect(zoomed(closer, 2, [5, 0, 5]).target).toEqual([3, 3, 3])
  })

  it('holds still at the zoom limits', () => {
    const near = { ...START_CAMERA, zoom: 0.25, target: [1, 1, 1] as const }

    expect(zoomed(near, 0.5, [5, 0, 5])).toEqual(near)
  })

  it('never lets the orbit point leave the field', () => {
    const far = zoomed({ ...START_CAMERA, zoom: 0.5 }, 4, [-20, 3, 3])

    expect(far.target).toEqual([6, 3, 3])
  })
})

describe('centred', () => {
  it('orbits the centre again and zooms back out to the whole field, the angle untouched', () => {
    expect(centred({ yaw: 2, pitch: -0.3, zoom: 0.4, target: [1, 2, 3] })).toEqual({
      yaw: 2,
      pitch: -0.3,
      zoom: 1,
      target: null,
    })
  })

  it('keeps a zoom that already shows everything', () => {
    expect(centred({ ...START_CAMERA, zoom: 2.5, target: [1, 2, 3] }).zoom).toBe(2.5)
  })

  it('knows when there is nothing to centre', () => {
    expect(isCentred(START_CAMERA)).toBe(true)
    expect(isCentred({ ...START_CAMERA, zoom: 3 })).toBe(true)
    expect(isCentred({ ...START_CAMERA, zoom: 0.5 })).toBe(false)
    expect(isCentred({ ...START_CAMERA, target: [1, 2, 3] })).toBe(false)
  })
})
