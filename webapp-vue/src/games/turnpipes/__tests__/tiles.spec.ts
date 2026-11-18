import { describe, expect, it } from 'vitest'
import { PLATE_URL, tileUrl } from '@/games/turnpipes/tiles'
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
