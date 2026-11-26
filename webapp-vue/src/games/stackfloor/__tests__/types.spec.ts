import { describe, expect, it } from 'vitest'
import {
  asStackFloorGuess,
  asStackFloorOutcome,
  asStackFloorPayload,
  asStackFloorScene,
  geometryOf,
} from '@/games/stackfloor/types'

const PAYLOAD = {
  fieldWidth: 1000,
  startWidth: 660,
  speedNum: 1,
  speedDen: 2,
  accelPercent: 3,
  perfectTolerance: 3,
  pauseMs: 300,
  maxFloors: 999,
  hueStart: 350,
  target: 12,
}

describe('asStackFloorPayload', () => {
  it('reads a valid payload, with or without a target', () => {
    expect(asStackFloorPayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asStackFloorPayload({ ...PAYLOAD, target: null })).toEqual({ ...PAYLOAD, target: null })
  })

  it('drops junk', () => {
    const missing: Partial<typeof PAYLOAD> = { ...PAYLOAD }
    delete missing.pauseMs

    expect(asStackFloorPayload(missing)).toBeNull()
    expect(asStackFloorPayload({ ...PAYLOAD, speedDen: 0 })).toBeNull()
    expect(asStackFloorPayload({ ...PAYLOAD, target: 1.5 })).toBeNull()
    expect(asStackFloorPayload({ ...PAYLOAD, startWidth: -1 })).toBeNull()
    expect(asStackFloorPayload(null)).toBeNull()
  })

  it('hands the tower function its geometry', () => {
    expect(geometryOf(PAYLOAD)).toEqual({
      fieldWidth: 1000,
      startWidth: 660,
      speedNum: 1,
      speedDen: 2,
      accelPercent: 3,
      perfectTolerance: 3,
      maxFloors: 999,
    })
  })
})

describe('asStackFloorScene', () => {
  it('reads a valid scene and drops junk', () => {
    const scene = { fieldWidth: 1000, startWidth: 660, hueStart: 20 }

    expect(asStackFloorScene(scene)).toEqual(scene)
    expect(asStackFloorScene({ fieldWidth: 1000 })).toBeNull()
  })
})

describe('asStackFloorOutcome', () => {
  it('reads known marks', () => {
    const outcome = { height: 4, marks: ['RESTARTED', 'SUBMITTED_BEFORE_RUN_END'] }

    expect(asStackFloorOutcome(outcome)).toEqual(outcome)
  })

  it('drops an unknown mark', () => {
    expect(asStackFloorOutcome({ height: 4, marks: ['CHEATED'] })).toBeNull()
    expect(asStackFloorOutcome({ height: -1, marks: [] })).toBeNull()
  })
})

describe('asStackFloorGuess', () => {
  it('reads clicks and the restarted flag', () => {
    expect(asStackFloorGuess({ clicks: [1, 2], restarted: true })).toEqual({
      clicks: [1, 2],
      restarted: true,
    })
  })

  it('reads a missing restarted as false', () => {
    expect(asStackFloorGuess({ clicks: [1] })).toEqual({ clicks: [1], restarted: false })
  })

  it('drops negative and fractional clicks', () => {
    expect(asStackFloorGuess({ clicks: [-1], restarted: false })).toBeNull()
    expect(asStackFloorGuess({ clicks: [1.5], restarted: false })).toBeNull()
  })
})
