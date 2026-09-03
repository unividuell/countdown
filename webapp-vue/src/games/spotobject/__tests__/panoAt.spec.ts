import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { panoAt, reachOf } from '../panoAt'

class FakeMap {
  constructor(
    private readonly zoom: number,
    private readonly latitude: number,
  ) {}

  getZoom = (): number => this.zoom
  getCenter = (): { lat: () => number } => ({ lat: () => this.latitude })
}

const getPanorama = vi.fn()

function installFakeGoogleMaps(): void {
  vi.stubGlobal('google', {
    maps: {
      StreetViewService: class {
        getPanorama = getPanorama
      },
    },
  } as unknown as typeof google)
}

function map(zoom: number, latitude = 41.4): google.maps.Map {
  return new FakeMap(zoom, latitude) as unknown as google.maps.Map
}

describe('panoAt', () => {
  beforeEach(() => {
    getPanorama.mockReset()
    installFakeGoogleMaps()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * The whole point: a metre is a different size at every zoom, a finger is not. At the zoom where
   * Google starts drawing the blue lines — which is where people search — the old fixed 50 m was
   * about seven pixels across.
   */
  it('reaches about a finger’s width, whatever the zoom', () => {
    // ~7.2 m per pixel at zoom 14, so a 44px finger is a few hundred metres.
    expect(Math.round(reachOf(map(14)))).toBe(315)
    // ~0.9 m per pixel at zoom 17 would be under the floor, and the floor is what it had before.
    expect(reachOf(map(17))).toBe(50)
    // And never a walk across town.
    expect(reachOf(map(10))).toBe(400)
  })

  it('answers with the panorama Google found', async () => {
    getPanorama.mockResolvedValue({ data: { location: { pano: 'pano-1' } } })

    await expect(
      panoAt(map(16), { lat: 1, lng: 1 } as unknown as google.maps.LatLng),
    ).resolves.toBe('pano-1')
    expect(getPanorama).toHaveBeenCalledWith({
      location: { lat: 1, lng: 1 },
      radius: reachOf(map(16)),
    })
  })

  /** Nothing within reach rejects rather than resolving; to a player both are „not here“. */
  it('answers with nothing when there is nothing, and when the request fails', async () => {
    getPanorama.mockRejectedValue(new Error('ZERO_RESULTS'))
    await expect(panoAt(map(16), {} as google.maps.LatLng)).resolves.toBeNull()

    getPanorama.mockResolvedValue({ data: {} })
    await expect(panoAt(map(16), {} as google.maps.LatLng)).resolves.toBeNull()
  })
})
