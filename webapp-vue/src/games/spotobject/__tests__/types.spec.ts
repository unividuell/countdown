import { describe, expect, it } from 'vitest'
import {
  asSpotObjectOutcome,
  asSpotObjectTip,
  flagOf,
  googleUrl,
  isSpotObjectPayload,
  shotUrl,
} from '../types'

describe('spot object types', () => {
  it('accepts a well-formed payload and rejects anything else', () => {
    expect(isSpotObjectPayload({ term: 'Rosa Gartenzwerg' })).toBe(true)
    expect(isSpotObjectPayload({ term: 42 })).toBe(false)
    expect(isSpotObjectPayload(null)).toBe(false)
  })

  it('reads a tip out of an unknown guess, or answers null', () => {
    expect(asSpotObjectTip({ panoId: 'a', heading: 1, pitch: 2, zoom: 3 })).toEqual({
      panoId: 'a',
      heading: 1,
      pitch: 2,
      zoom: 3,
    })
    expect(asSpotObjectTip({ panoId: 'a' })).toBeNull()
    expect(asSpotObjectTip(undefined)).toBeNull()
  })

  it('reads an outcome out of an unknown value, or answers null', () => {
    expect(asSpotObjectOutcome({ country: 'ES' })).toEqual({ country: 'ES' })
    expect(asSpotObjectOutcome({ country: null })).toEqual({ country: null })
    expect(asSpotObjectOutcome({ country: 42 })).toBeNull()
    expect(asSpotObjectOutcome(undefined)).toBeNull()
  })

  /** Our own endpoint, never Google's: the signature is the server's business. */
  it('builds the still url against our own endpoint', () => {
    const url = shotUrl({ panoId: 'a b', heading: 12, pitch: 0, zoom: 1 }, 400, 300)

    expect(url.startsWith('/api/spot-object/shot?')).toBe(true)
    expect(url).toContain('pano=a+b')
    expect(url).toContain('fov=90')
    expect(url).not.toContain('key=')
  })

  /** Free, keyless, and it is where a reviewer is meant to move around — not on our board. */
  it('builds a Maps URL into Google’s own viewer', () => {
    expect(googleUrl({ panoId: 'a', heading: 0, pitch: 0, zoom: 1 })).toContain('map_action=pano')
  })

  it('turns a country code into a flag, and null into nothing', () => {
    expect(flagOf('ES')).toBe('🇪🇸')
    expect(flagOf(null)).toBe('')
  })
})
