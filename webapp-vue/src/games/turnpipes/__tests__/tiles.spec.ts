import { describe, expect, it } from 'vitest'
import { motifUrl, plateUrl, puddleUrl, tileUrl } from '@/games/turnpipes/tiles'
import type { PipeKindCode } from '@/games/turnpipes/types'

const KINDS: PipeKindCode[] = ['STRAIGHT', 'ELBOW', 'INLET', 'OUTLET']

describe('tileUrl', () => {
  it('has an image for every kind, wet and dry', () => {
    expect(plateUrl(false)).toBeTruthy()
    for (const kind of KINDS) {
      expect(tileUrl(kind, false)).toBeTruthy()
      expect(tileUrl(kind, true)).toBeTruthy()
    }
  })

  it('shows the fountain stub wet either way', () => {
    expect(tileUrl('INLET', false)).toBe(tileUrl('INLET', true))
  })

  it('plates glow where the water ran: every tile heats the tub', () => {
    expect(plateUrl(true)).toBeTruthy()
    expect(plateUrl(true)).not.toBe(plateUrl(false))
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

describe('motifUrl', () => {
  it('puts an upright picture on the ends only: the fountain, and the tub filling up', () => {
    expect(motifUrl('INLET', false)).toBeTruthy()
    expect(motifUrl('INLET', true)).toBe(motifUrl('INLET', false))
    expect(motifUrl('OUTLET', false)).toBeTruthy()
    expect(motifUrl('OUTLET', true)).not.toBe(motifUrl('OUTLET', false))
    expect(motifUrl('STRAIGHT', true)).toBeNull()
    expect(motifUrl('ELBOW', false)).toBeNull()
  })

  it('a cold tub is full but its own picture; cold changes nothing else', () => {
    const cold = motifUrl('OUTLET', true, true)

    expect(cold).toBeTruthy()
    expect(cold).not.toBe(motifUrl('OUTLET', true))
    expect(cold).not.toBe(motifUrl('OUTLET', false))
    expect(motifUrl('OUTLET', false, true)).toBe(motifUrl('OUTLET', false))
    expect(motifUrl('INLET', true, true)).toBe(motifUrl('INLET', true))
  })
})
