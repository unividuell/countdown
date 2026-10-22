import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS, KOLLEKTIV, toggleLayer } from '@/games/paintratio/layers'

describe('toggleLayer', () => {
  it('adds a layer on top and removes it on the second tap', () => {
    expect(toggleLayer([KOLLEKTIV], 'u1')).toEqual([KOLLEKTIV, 'u1'])
    expect(toggleLayer([KOLLEKTIV, 'u1', 'u2'], 'u1')).toEqual([KOLLEKTIV, 'u2'])
    expect(toggleLayer([], KOLLEKTIV)).toEqual([KOLLEKTIV])
  })

  it('stacks in the order of the taps, the picture included', () => {
    const picture = toggleLayer(toggleLayer([KOLLEKTIV], 'u1'), KOLLEKTIV)
    expect(picture).toEqual(['u1'])
    expect(toggleLayer(picture, KOLLEKTIV)).toEqual(['u1', KOLLEKTIV])
  })

  it('leaves the list it was given alone', () => {
    const selected = [KOLLEKTIV]
    toggleLayer(selected, 'u1')

    expect(selected).toEqual([KOLLEKTIV])
  })

  it('opens on the Kollektiv Kommune alone', () => {
    expect(DEFAULT_LAYERS).toEqual([KOLLEKTIV])
  })
})
