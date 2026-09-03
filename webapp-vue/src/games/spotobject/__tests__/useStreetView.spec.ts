import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { Ref } from 'vue'

vi.mock('@/api/client', () => ({ apiFetch: vi.fn() }))
import { apiFetch } from '@/api/client'

/**
 * `useStreetView` keeps its shared Maps-script promise in module state on purpose — one script
 * tag for the whole document, however many boards ask for it — so a case that reused the module
 * from a previous case would see an already-resolved load and never touch `document.createElement`
 * again. Reload the module fresh per case, the same way `usePlayback.spec.ts` does for its own
 * module state.
 */
type UseStreetView = typeof import('../useStreetView').useStreetView
let useStreetView: UseStreetView

async function loadModule(): Promise<void> {
  vi.resetModules()
  useStreetView = (await import('../useStreetView')).useStreetView
}

/**
 * A hand-stubbed `google.maps` — just enough surface for the composable to run against, so this
 * suite never loads Google's real script or reaches the network. `StreetViewPanorama` is a bare
 * spy on purpose: the rule under test is that it is never called at all, only `map.getStreetView()`.
 */
class FakePanorama {
  visible = false
  panoIdValue = 'initial-pano'
  positionValue: unknown = { lat: 48, lng: 11 }
  pov = { heading: 0, pitch: 0 }
  zoomValue = 1
  status = 'OK'
  private readonly handlers = new Map<string, Array<() => void>>()

  setOptions = vi.fn()
  setPosition = vi.fn()
  setPano = vi.fn()
  getPosition = vi.fn(() => this.positionValue)
  getStatus = vi.fn(() => this.status)
  setVisible = vi.fn((value: boolean) => {
    this.visible = value
  })
  getVisible = vi.fn(() => this.visible)
  getPano = vi.fn(() => this.panoIdValue)
  getPov = vi.fn(() => this.pov)
  getZoom = vi.fn(() => this.zoomValue)
  addListener = vi.fn((event: string, callback: () => void) => {
    const list = this.handlers.get(event) ?? []
    list.push(callback)
    this.handlers.set(event, list)
  })

  /** Fires every listener registered for `event` — how the test simulates Google's own events. */
  fire(event: string): void {
    this.handlers.get(event)?.forEach((callback) => callback())
  }
}

class FakeMap {
  static instances: FakeMap[] = []
  readonly panorama = new FakePanorama()
  center: unknown = { lat: 48, lng: 11 }
  private readonly handlers = new Map<string, Array<(event?: unknown) => void>>()

  getStreetView = vi.fn(() => this.panorama)
  getCenter = vi.fn(() => this.center)
  setCenter = vi.fn()
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

class FakeCoverageLayer {
  setMap = vi.fn()
}

/** The trail and the mark. Only their existence matters here — `useWalkMap.spec.ts` owns both. */
class FakePolyline {
  setMap = vi.fn()
  setPath = vi.fn()
  setOptions = vi.fn()
}

class FakeMarker {
  setPosition = vi.fn()
  setIcon = vi.fn()
}

const streetViewPanoramaCtor = vi.fn()

/** Everything the composable is given from the round: a colour, and whether the board is locked. */
function deps(locked = false): { trailColor: Ref<string>; locked: Ref<boolean> } {
  return { trailColor: ref('#8e44ad'), locked: ref(locked) }
}

/** A press on the map, the way `onMapPress` hears one — Google's click, then its own wait. */
function pressMap(map: FakeMap, at: unknown = { lat: 41.4, lng: 2.2 }): void {
  map.fire('click', { latLng: at })
  vi.advanceTimersByTime(300)
}

function installFakeGoogleMaps(): void {
  FakeMap.instances = []
  vi.stubGlobal('google', {
    maps: {
      Map: FakeMap,
      ControlPosition: { RIGHT_CENTER: 7 },
      StreetViewCoverageLayer: FakeCoverageLayer,
      StreetViewPanorama: streetViewPanoramaCtor,
      Polyline: FakePolyline,
      Marker: FakeMarker,
      SymbolPath: { CIRCLE: 0 },
    },
  } as unknown as typeof google)
}

/**
 * Replaces the one `<script>` the composable ever creates with a plain object: nothing is ever
 * appended to a real document, so nothing ever asks the network for it. `triggerScriptLoad` reads
 * the `callback` query param straight off the assigned `src` and calls it — the same contract a
 * real `<script src=…&callback=…>` load fulfils, minus Google's server.
 */
function stubScriptTag(): { src: string; onerror: (() => void) | null } {
  const script = { src: '', async: false, onerror: null as (() => void) | null }
  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) =>
    tagName === 'script'
      ? (script as unknown as HTMLScriptElement)
      : originalCreateElement(tagName)) as typeof document.createElement)
  vi.spyOn(document.head, 'append').mockImplementation(() => {})
  return script
}

function triggerScriptLoad(script: { src: string }): void {
  const callbackName = new URL(script.src).searchParams.get('callback')
  if (!callbackName) throw new Error('script src carries no callback param')
  const callback = (window as unknown as Record<string, () => void>)[callbackName]
  if (!callback) throw new Error(`no global callback registered as '${callbackName}'`)
  callback()
}

describe('useStreetView', () => {
  let script: { src: string; onerror: (() => void) | null }

  beforeEach(async () => {
    // A press waits out the double click on a timer, and so does the status it asks for.
    vi.useFakeTimers()
    vi.mocked(apiFetch).mockResolvedValue({ mapsApiKey: 'test-key' })
    installFakeGoogleMaps()
    streetViewPanoramaCtor.mockClear()
    script = stubScriptTag()
    await loadModule()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('takes the map’s own default panorama and never constructs one', async () => {
    const { mount, error } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]
    expect(map?.getStreetView).toHaveBeenCalledOnce()
    expect(streetViewPanoramaCtor).not.toHaveBeenCalled()
    expect(error.value).toBeNull()
  })

  /**
   * Both ways in, side by side. The press is the phone-friendly one — a drag hides the spot being
   * aimed at under the finger — but it reaches only the 50 m `setPosition` is fixed at, so the
   * Pegman has to stay for everything past that.
   */
  it('keeps the Pegman and walks in where the map was pressed', async () => {
    const { mount } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    expect(map.options.streetViewControl).toBe(true)
    expect(map.options.streetViewControlOptions).toEqual({ position: 7 })

    pressMap(map)

    // The map's own panorama, moved — not a constructed one, and not a service lookup: this is
    // the call a landing Pegman made, so it costs what dragging cost. And the pressed point, not
    // the map's centre: the finger aims, so the map does not have to be panned to aim with it.
    expect(map.panorama.setPosition).toHaveBeenCalledWith({ lat: 41.4, lng: 2.2 })
    expect(map.panorama.setVisible).toHaveBeenCalledWith(true)
    expect(streetViewPanoramaCtor).not.toHaveBeenCalled()
  })

  it('takes no press while the round is locked', async () => {
    const { mount } = useStreetView(deps(true))

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    pressMap(map)

    expect(map.panorama.setPosition).not.toHaveBeenCalled()
  })

  /** Otherwise the answer to a press over open water is Google's own grey „no imagery“ panel. */
  it('takes back a panorama that found nothing, and says so', async () => {
    const { mount, noCoverage } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const panorama = FakeMap.instances[0]!.panorama
    panorama.status = 'ZERO_RESULTS'
    panorama.fire('status_changed')

    expect(panorama.setVisible).toHaveBeenCalledWith(false)
    expect(noCoverage.value).toBe(true)
  })

  /**
   * Google's status only announces itself when it changes, so pressing a second dead spot is
   * answered by silence — and, because the panorama was already shown, by Google's own grey
   * „no imagery“ panel. Reading the status once, a moment later, is what catches that press.
   */
  it('answers a press Google never announced a status for', async () => {
    const { mount, noCoverage } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    map.panorama.status = 'ZERO_RESULTS'
    pressMap(map)
    // Still on screen: nothing has told us otherwise yet.
    expect(noCoverage.value).toBe(false)

    vi.advanceTimersByTime(1000)

    expect(map.panorama.setVisible).toHaveBeenLastCalledWith(false)
    expect(noCoverage.value).toBe(true)
  })

  it('withdraws the notice when the map moves, and when it is pressed again', async () => {
    const { mount, noCoverage } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    map.panorama.status = 'ZERO_RESULTS'
    map.panorama.fire('status_changed')
    expect(noCoverage.value).toBe(true)

    map.fire('center_changed')
    expect(noCoverage.value).toBe(false)

    map.panorama.fire('status_changed')
    pressMap(map)

    // A finger can aim somewhere else straight away; only the map's centre could not.
    expect(noCoverage.value).toBe(false)
    expect(map.panorama.setPosition).toHaveBeenCalledWith({ lat: 41.4, lng: 2.2 })
  })

  it('turns the motion-tracking control off', async () => {
    const { mount } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    // Offered on anything reporting an orientation sensor, a laptop included, where it is a
    // phone icon in the corner that explains itself to nobody.
    const options = FakeMap.instances[0]!.panorama.setOptions.mock.calls[0]![0]
    expect(options).toMatchObject({ motionTracking: false, motionTrackingControl: false })
  })

  it('fetches the key from the config endpoint rather than a bundled constant', async () => {
    const { mount } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledWith('/api/spot-object/config')
    expect(script.src).toContain('key=test-key')

    triggerScriptLoad(script)
    await pending
  })

  it('tracks which panorama is open, and whether one is', async () => {
    const { mount, pano } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const panorama = FakeMap.instances[0]!.panorama
    panorama.visible = true
    panorama.fire('visible_changed')
    panorama.panoIdValue = 'pano-77'
    panorama.fire('pano_changed')

    expect(pano).toEqual({ visible: true, panoId: 'pano-77' })
  })

  /**
   * The whole game: arrive somewhere, then turn until the object is in frame. Turning fires
   * `pov_changed`, never `pano_changed`, so a tip assembled from what the last `pano_changed`
   * carried would record the direction the player arrived from — a frame that does not show what
   * they found. This case therefore pans and zooms *without* firing `pano_changed`.
   */
  it('reads the view at submit time, so turning after arrival is what gets submitted', async () => {
    const { mount, currentTip } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const panorama = FakeMap.instances[0]!.panorama
    panorama.panoIdValue = 'pano-77'
    panorama.fire('pano_changed')

    panorama.pov = { heading: 212, pitch: -4 }
    panorama.zoomValue = 3

    expect(currentTip()).toEqual({ panoId: 'pano-77', heading: 212, pitch: -4, zoom: 3 })
  })

  it('has no tip to submit while no panorama is open', async () => {
    const { mount, currentTip } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    FakeMap.instances[0]!.panorama.panoIdValue = ''

    expect(currentTip()).toBeNull()
  })

  /** „Versuch es später noch einmal“ has to have a path that can succeed. */
  it('lets a later mount append a new script tag after a failed load', async () => {
    const { mount: first } = useStreetView(deps())
    const pending = first(document.createElement('div'))
    await flushPromises()
    script.onerror?.()
    await pending

    const appends = vi.mocked(document.head.append).mock.calls.length
    const { mount: second, error } = useStreetView(deps())
    const retry = second(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await retry

    expect(vi.mocked(document.head.append).mock.calls.length).toBe(appends + 1)
    expect(error.value).toBeNull()
  })

  /**
   * The ring around the crosshair sits where a dropped Pegman most often lands, so it has to be
   * gone for the length of that drag. Watched through Google's own class name, which is a coupling
   * that fails harmlessly: no match means the ring simply stays, exactly as it was before.
   */
  /**
   * Google walks and turns on the arrow keys but never cancels them, so the same press scrolled
   * the page out from under the board.
   */
  it('keeps the arrow keys from scrolling the page as well', async () => {
    const element = document.createElement('div')
    const { mount } = useStreetView(deps())
    const pending = mount(element)
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const press = (key: string): boolean => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      element.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(press('ArrowDown')).toBe(true)
    // Only what scrolls: typing is nobody else's business here, and „Gefunden“ is a button.
    expect(press('Enter')).toBe(false)
  })

  it('returns to the world map by hiding the same panorama, not replacing it', async () => {
    const { mount, toWorldMap } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    toWorldMap()

    expect(FakeMap.instances[0]!.panorama.setVisible).toHaveBeenCalledWith(false)
  })

  /**
   * Shrinking back out of the full-screen map is not a second entry: the panorama was hidden, not
   * dropped, so showing it again asks Google nothing and lands on the panorama the player left.
   */
  it('comes back to the same panorama without looking anything up', async () => {
    const { mount, toWorldMap, toPanorama } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const panorama = FakeMap.instances[0]!.panorama
    toWorldMap()
    panorama.setPosition.mockClear()
    toPanorama()

    expect(panorama.setVisible).toHaveBeenLastCalledWith(true)
    expect(panorama.setPosition).not.toHaveBeenCalled()
  })

  /**
   * The whole point of walking is that you end up somewhere else. Before this, „← Weltkarte“ put
   * the player back at the point they had gone in at, however far they had walked.
   */
  it('walks the world map along, so leaving lands where the walking stopped', async () => {
    const { mount } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    map.panorama.positionValue = { lat: 41.4, lng: 2.2 }
    map.panorama.fire('pano_changed')

    expect(map.setCenter).toHaveBeenCalledWith({ lat: 41.4, lng: 2.2 })
  })

  it('lets the walk map take back its own missed tap instead of hiding the panorama', async () => {
    const { mount, openMiniMap, noCoverage, jumpMissed } = useStreetView(deps())

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    // Arrive somewhere first: the mini-map only exists inside a panorama, and taking a miss back
    // means going back to the panorama that was walked.
    map.panorama.fire('pano_changed')
    map.panorama.setVisible.mockClear()
    await openMiniMap(document.createElement('div'))
    FakeMap.instances[1]!.fire('click', { latLng: { lat: 3, lng: 3 } })
    vi.advanceTimersByTime(300)

    map.panorama.status = 'ZERO_RESULTS'
    map.panorama.fire('status_changed')

    expect(map.panorama.setVisible).not.toHaveBeenCalledWith(false)
    expect(noCoverage.value).toBe(false)
    expect(jumpMissed.value).toBe(true)
  })
})
