import { describe, expect, it } from 'vitest'
import { myWin } from '../verdict'

const rows = [
  { userId: 'me', points: 3 },
  { userId: 'you', points: 0 },
  { userId: 'late', points: null },
]

describe('myWin', () => {
  it('with a gate: my tip inside it, whatever the points say', () => {
    expect(myWin({ gated: true, withinGate: true, rows, mineUserId: 'you' })).toBe(true)
    expect(myWin({ gated: true, withinGate: false, rows, mineUserId: 'me' })).toBe(false)
  })

  it('with a gate but no verdict on my tip: no sound', () => {
    expect(myWin({ gated: true, withinGate: null, rows, mineUserId: 'me' })).toBeNull()
  })

  it('without a gate: my row holds the points now', () => {
    expect(myWin({ gated: false, withinGate: false, rows, mineUserId: 'me' })).toBe(true)
    expect(myWin({ gated: false, withinGate: true, rows, mineUserId: 'you' })).toBe(false)
  })

  it('without a gate and without a scored row of mine: no sound', () => {
    expect(myWin({ gated: false, withinGate: null, rows, mineUserId: 'late' })).toBeNull()
    expect(myWin({ gated: false, withinGate: null, rows, mineUserId: 'nobody' })).toBeNull()
    expect(myWin({ gated: false, withinGate: null, rows, mineUserId: null })).toBeNull()
  })
})
