import { describe, expect, it } from 'vitest'
import { asGuessHuePayload } from '@/games/guesshue/types'

const PAYLOAD = {
  description: 'Testbeschreibung einer Farbe.',
  initHue: 210.4,
  saturation: 0.6,
  lightness: 0.45,
  toleranceDeg: 10,
}

describe('asGuessHuePayload', () => {
  it('reads a payload, with or without a tolerance window', () => {
    expect(asGuessHuePayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asGuessHuePayload({ ...PAYLOAD, toleranceDeg: null })).toEqual({
      ...PAYLOAD,
      toleranceDeg: null,
    })
  })

  it.each([
    ['null', null],
    ['a number', 7],
    ['another game’s payload', { stageDurationsSeconds: [1, 2] }],
    ['a missing description', { ...PAYLOAD, description: undefined }],
    ['a non-finite start angle', { ...PAYLOAD, initHue: NaN }],
    ['a string saturation', { ...PAYLOAD, saturation: '0.6' }],
    ['a non-finite lightness', { ...PAYLOAD, lightness: Infinity }],
    ['a missing tolerance', { ...PAYLOAD, toleranceDeg: undefined }],
  ])('turns %s into null', (_label, payload) => {
    expect(asGuessHuePayload(payload)).toBeNull()
  })
})
