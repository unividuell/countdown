import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useWalkMap } from '../useWalkMap'

/**
 * A hand-stubbed `google.maps`, the same shape `useStreetView.spec.ts` uses — just enough surface
 * for the walk map to run against, so this suite never loads Google's real script. The panorama
 * constructor is a bare spy for one reason: the rule that it is never called survives here too,
 * because the mini-map is where somebody would be tempted to construct one.
 */
class FakeMap {
  static instances: FakeMap[] = []
  setCenter = vi.fn()
  // `panoAt` measures a finger against the map's own scale, so the fake has to have one.
  getZoom = vi.fn(() => 17)
  getCenter = vi.fn(() => ({ lat: () => 41.4 }))
  private readonly handlers = new Map<string, Array<(event?: unknown) => void>>()

  addListener = vi.fn((event: string, callback: (event?: unknown) => void) => {
    const list = this.handlers.get(event) ?? []
    list.push(callback)
    this.handlers.set(event, list)
  })

  constructor(
    readonly element: unknown,
    readonly options: Record<string, unknown>,
  ) {
    FakeMap.instances.push(this)
  }

  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((callback) => callback(payload))
  }
}

class FakePanorama {
  panoIdValue: string | null = null
  positionValue: unknown = null
  readonly handlers = new Map<string, Array<() => void>>()

  setPosition = vi.fn()
  setPano = vi.fn()
  setVisible = vi.fn()
  pov = { heading: 0, pitch: 0 }
  getPov = vi.fn(() => this.pov)
  getPano = vi.fn(() => this.panoIdValue)
  getPosition = vi.fn(() => this.positionValue)
  addListener = vi.fn((event: string, callback: () => void) => {
    const list = this.handlers.get(event) ?? []
    list.push(callback)
    this.handlers.set(event, list)
  })

  /** Turning on the spot, which is all Google announces for it. */
  turnTo(heading: number): void {
    this.pov = { ...this.pov, heading }
    this.handlers.get('pov_changed')?.forEach((callback) => callback())
  }

  /** Google announcing that a panorama actually loaded — the only thing that counts as a step. */
  arriveAt(panoId: string, position: unknown): void {
    this.panoIdValue = panoId
    this.positionValue = position
    this.handlers.get('pano_changed')?.forEach((callback) => callback())
  }
}

class FakePolyline {
  static instances: FakePolyline[] = []
  setMap = vi.fn()
  setPath = vi.fn()
  setOptions = vi.fn()

  constructor(readonly options: Record<string, unknown>) {
    FakePolyline.instances.push(this)
  }
}

class FakeMarker {
  static instances: FakeMarker[] = []
  setPosition = vi.fn()
  setIcon = vi.fn()

  constructor(readonly options: Record<string, unknown>) {
    FakeMarker.instances.push(this)
  }
}

class FakeCoverageLayer {
  static instances: FakeCoverageLayer[] = []
  setMap = vi.fn()

  constructor() {
    FakeCoverageLayer.instances.push(this)
  }
}

const streetViewPanoramaCtor = vi.fn()
const getPanorama = vi.fn()

function installFakeGoogleMaps(): void {
  FakeMap.instances = []
  FakePolyline.instances = []
  FakeCoverageLayer.instances = []
  FakeMarker.instances = []
  streetViewPanoramaCtor.mockClear()
  getPanorama.mockReset()
  getPanorama.mockResolvedValue({ data: { location: { pano: 'found-pano' } } })
  vi.stubGlobal('google', {
    maps: {
      Map: FakeMap,
      Polyline: FakePolyline,
      StreetViewCoverageLayer: FakeCoverageLayer,
      Marker: FakeMarker,
      StreetViewService: class {
        getPanorama = getPanorama
      },
      StreetViewPanorama: streetViewPanoramaCtor,
      SymbolPath: { CIRCLE: 0 },
    },
  } as unknown as typeof google)
}

function attached(color = '#8e44ad'): {
  walk: ReturnType<typeof useWalkMap>
  map: FakeMap
  panorama: FakePanorama
  trailColor: ReturnType<typeof ref<string>>
} {
  const trailColor = ref(color)
  const walk = useWalkMap(trailColor)
  const map = new FakeMap(document.createElement('div'), {})
  const panorama = new FakePanorama()
  walk.attach({
    map: map as unknown as google.maps.Map,
    panorama: panorama as unknown as google.maps.StreetViewPanorama,
  })
  return { walk, map, panorama, trailColor }
}

/** The world map's trail is the first polyline built; the mini-map's is the second. */
function worldTrail(): FakePolyline {
  const trail = FakePolyline.instances[0]
  if (!trail) throw new Error('no polyline was built for the world map')
  return trail
}

/**
 * A press on the mini-map: the click, the wait that tells it apart from a double click, and the
 * lookup that answers it. `advanceTimersByTimeAsync` drains the microtasks in between, which the
 * synchronous form does not — the lookup is a promise.
 */
async function pressMiniMap(at: unknown = { lat: 3, lng: 3 }): Promise<void> {
  FakeMap.instances[1]?.fire('click', { latLng: at })
  await vi.advanceTimersByTimeAsync(300)
}

describe('useWalkMap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installFakeGoogleMaps()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('draws the walk as dots in the player’s own colour', () => {
    attached('#8e44ad')

    const icon = worldTrail().options.icons as Array<{ icon: Record<string, unknown> }>
    expect(worldTrail().options.strokeOpacity).toBe(0)
    expect(icon[0]?.icon.fillColor).toBe('#8e44ad')
  })

  it('grows the trail once per panorama actually arrived at', () => {
    const { panorama } = attached()

    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })
    panorama.arriveAt('pano-2', { lat: 2, lng: 2 })

    expect(worldTrail().setPath).toHaveBeenCalledTimes(2)
    expect(worldTrail().setPath.mock.lastCall?.[0]).toHaveLength(2)
  })

  it('follows the player’s colour when the round finally names it', async () => {
    const { trailColor } = attached('#404040')

    trailColor.value = '#8e44ad'
    await nextTick()

    const options = worldTrail().setOptions.mock.lastCall?.[0] as {
      icons: Array<{ icon: Record<string, unknown> }>
    }
    expect(options.icons[0]?.icon.fillColor).toBe('#8e44ad')
  })

  it('builds the mini-map on the first open and never a second time', async () => {
    const { walk } = attached()
    const element = document.createElement('div')

    await walk.openMiniMap(element)
    await walk.openMiniMap(element)

    expect(FakeMap.instances).toHaveLength(2)
    expect(FakeMap.instances[1]?.element).toBe(element)
    expect(streetViewPanoramaCtor).not.toHaveBeenCalled()
  })

  it('gives the mini-map the blue lines a press has to aim at, and Google’s own zoom', async () => {
    const { walk } = attached()

    await walk.openMiniMap(document.createElement('div'))

    expect(FakeCoverageLayer.instances[0]?.setMap).toHaveBeenCalledWith(FakeMap.instances[1])
    // Turning the double click off would have been the cheap way to stop it pressing twice.
    expect(FakeMap.instances[1]?.options.disableDoubleClickZoom).toBeUndefined()
  })

  it('keeps the mini-map centred on the player, step by step', async () => {
    const { walk, panorama } = attached()

    await walk.openMiniMap(document.createElement('div'))
    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })

    expect(FakeMap.instances[1]?.setCenter).toHaveBeenLastCalledWith({ lat: 1, lng: 1 })
  })

  it('goes to the panorama a press found, by id and without constructing one', async () => {
    const { walk, panorama } = attached()

    await walk.openMiniMap(document.createElement('div'))
    await pressMiniMap({ lat: 3, lng: 3 })

    // A finger's reach, asked for in metres — not the fixed 50 m the panorama searches on its own.
    expect(getPanorama).toHaveBeenCalledWith({ location: { lat: 3, lng: 3 }, radius: 50 })
    expect(panorama.setPano).toHaveBeenCalledWith('found-pano')
    expect(streetViewPanoramaCtor).not.toHaveBeenCalled()
  })

  /**
   * The miss used to have to be taken back: the panorama had already been moved, and Google took
   * it off screen, which dropped the player onto the full-screen map and lost the walk. Asking
   * first means there is nothing to undo.
   */
  it('leaves the walk alone when a press finds nothing, and says so', async () => {
    const { walk, panorama } = attached()
    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })

    await walk.openMiniMap(document.createElement('div'))
    getPanorama.mockRejectedValue(new Error('ZERO_RESULTS'))
    await pressMiniMap()

    expect(panorama.setPano).not.toHaveBeenCalled()
    expect(panorama.setVisible).not.toHaveBeenCalled()
    expect(walk.jumpMissed.value).toBe(true)
  })

  it('withdraws the notice as soon as a press lands', async () => {
    const { walk, panorama } = attached()
    await walk.openMiniMap(document.createElement('div'))
    getPanorama.mockRejectedValue(new Error('ZERO_RESULTS'))
    await pressMiniMap()

    panorama.arriveAt('pano-2', { lat: 2, lng: 2 })

    expect(walk.jumpMissed.value).toBe(false)
  })

  it('does not count a panorama already walked as a step of its own', () => {
    const { panorama } = attached()

    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })
    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })

    expect(worldTrail().setPath.mock.lastCall?.[0]).toHaveLength(1)
  })

  it('does nothing at all before the map exists', async () => {
    const walk = useWalkMap(ref('#8e44ad'))

    await walk.openMiniMap(document.createElement('div'))

    expect(FakeMap.instances).toHaveLength(0)
  })

  /**
   * The mark used to be drawn over the middle of the panel, which made it a lie the moment the
   * player panned the map: the tiles moved, the mark did not, and it pointed at whatever had
   * slid under it.
   */
  it('puts the player on the map, so panning cannot move them', async () => {
    const { walk, panorama } = attached('#8e44ad')
    panorama.arriveAt('pano-1', { lat: 1, lng: 1 })

    await walk.openMiniMap(document.createElement('div'))
    panorama.arriveAt('pano-2', { lat: 2, lng: 2 })

    const marker = FakeMarker.instances[0]
    expect(marker?.options.map).toBe(FakeMap.instances[1])
    expect(marker?.setPosition).toHaveBeenLastCalledWith({ lat: 2, lng: 2 })
    // A press on the player has to reach the map underneath, or the one spot you aim at most is
    // the one you cannot walk to.
    expect(marker?.options.clickable).toBe(false)
  })

  it('turns the player with the view, not with the walk', async () => {
    const { walk, panorama } = attached()
    await walk.openMiniMap(document.createElement('div'))

    panorama.turnTo(215)

    const icon = FakeMarker.instances[0]?.setIcon.mock.lastCall?.[0] as { rotation: number }
    expect(icon.rotation).toBe(215)
  })
})
