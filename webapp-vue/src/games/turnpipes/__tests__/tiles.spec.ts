import { describe, expect, it } from 'vitest'
import { PLATE_URL, puddleUrl, tileUrl } from '@/games/turnpipes/tiles'
import type { PipeKindCode } from '@/games/turnpipes/types'

const KINDS: PipeKindCode[] = ['STRAIGHT', 'ELBOW', 'INLET', 'OUTLET']

describe('tileUrl', () => {
  it('has an image for every kind, wet and dry', () => {
    expect(PLATE_URL).toBeTruthy()
    for (const kind of KINDS) {
      expect(tileUrl(kind, false)).toBeTruthy()
      expect(tileUrl(kind, true)).toBeTruthy()
    }
  })

  it('shows the inlet wet either way', () => {
    expect(tileUrl('INLET', false)).toBe(tileUrl('INLET', true))
  })

  it('tells wet from dry for the rest', () => {
    for (const kind of ['STRAIGHT', 'ELBOW', 'OUTLET'] as const) {
      expect(tileUrl(kind, true)).not.toBe(tileUrl(kind, false))
    }
  })
})

describe('puddleUrl', () => {
  it('cycles through three puddles, so a field of them does not repeat next door', () => {
    const urls = [0, 1, 2].map(puddleUrl)

    expect(new Set(urls).size).toBe(3)
    expect(puddleUrl(3)).toBe(urls[0])
    expect(puddleUrl(7)).toBe(urls[1])
  })
})
