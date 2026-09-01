import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

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
  pov = { heading: 0, pitch: 0 }
  zoomValue = 1
  status = 'OK'
  private readonly handlers = new Map<string, Array<() => void>>()

  setOptions = vi.fn()
  setPosition = vi.fn()
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
  private readonly handlers = new Map<string, Array<() => void>>()

  getStreetView = vi.fn(() => this.panorama)
  getCenter = vi.fn(() => this.center)
  addListener = vi.fn((event: string, callback: () => void) => {
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

  fire(event: string): void {
    this.handlers.get(event)?.forEach((callback) => callback())
  }
}

class FakeCoverageLayer {
  setMap = vi.fn()
}

const streetViewPanoramaCtor = vi.fn()

function installFakeGoogleMaps(): void {
  FakeMap.instances = []
  vi.stubGlobal('google', {
    maps: {
      Map: FakeMap,
      ControlPosition: { RIGHT_CENTER: 7 },
      StreetViewCoverageLayer: FakeCoverageLayer,
      StreetViewPanorama: streetViewPanoramaCtor,
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
    vi.mocked(apiFetch).mockResolvedValue({ mapsApiKey: 'test-key' })
    installFakeGoogleMaps()
    streetViewPanoramaCtor.mockClear()
    script = stubScriptTag()
    await loadModule()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('takes the map’s own default panorama and never constructs one', async () => {
    const { mount, error } = useStreetView()

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
  it('keeps the Pegman and adds a press on the crosshair’s point', async () => {
    const { mount, toStreetView } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    expect(map.options.streetViewControl).toBe(true)
    expect(map.options.streetViewControlOptions).toEqual({ position: 7 })

    toStreetView()

    // The map's own panorama, moved — not a constructed one, and not a service lookup: this is
    // the call a landing Pegman made, so it costs what dragging cost.
    expect(map.panorama.setPosition).toHaveBeenCalledWith(map.center)
    expect(map.panorama.setVisible).toHaveBeenCalledWith(true)
    expect(streetViewPanoramaCtor).not.toHaveBeenCalled()
  })

  /** Otherwise the answer to a press over open water is Google's own grey „no imagery“ panel. */
  it('takes back a panorama that found nothing, and says so', async () => {
    const { mount, noCoverage } = useStreetView()

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
   * The notice is about one point, so it lives exactly as long as that point is under the
   * crosshair — and until then a second press is refused, because asking the same question twice
   * changes no status and so fires nothing to hide the panorama with.
   */
  it('holds the notice until the map moves, and refuses to ask twice', async () => {
    const { mount, noCoverage, toStreetView } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    const map = FakeMap.instances[0]!
    map.panorama.status = 'ZERO_RESULTS'
    map.panorama.fire('status_changed')

    toStreetView()
    expect(map.panorama.setPosition).not.toHaveBeenCalled()

    map.fire('center_changed')
    expect(noCoverage.value).toBe(false)

    toStreetView()
    expect(map.panorama.setPosition).toHaveBeenCalledWith(map.center)
  })

  it('turns the motion-tracking control off', async () => {
    const { mount } = useStreetView()

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
    const { mount } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledWith('/api/spot-object/config')
    expect(script.src).toContain('key=test-key')

    triggerScriptLoad(script)
    await pending
  })

  it('tracks which panorama is open, and whether one is', async () => {
    const { mount, pano } = useStreetView()

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
    const { mount, currentTip } = useStreetView()

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
    const { mount, currentTip } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    FakeMap.instances[0]!.panorama.panoIdValue = ''

    expect(currentTip()).toBeNull()
  })

  /** „Versuch es später noch einmal“ has to have a path that can succeed. */
  it('lets a later mount append a new script tag after a failed load', async () => {
    const { mount: first } = useStreetView()
    const pending = first(document.createElement('div'))
    await flushPromises()
    script.onerror?.()
    await pending

    const appends = vi.mocked(document.head.append).mock.calls.length
    const { mount: second, error } = useStreetView()
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
  it('knows while the Pegman is in the air', async () => {
    const element = document.createElement('div')
    const control = document.createElement('div')
    control.className = 'gm-svpc'
    element.append(control)

    const { mount, pegmanDragging } = useStreetView()
    const pending = mount(element)
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(pegmanDragging.value).toBe(false)

    control.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(pegmanDragging.value).toBe(true)

    // Wherever the finger lifts — the drop is nearly always outside the control it started on.
    window.dispatchEvent(new Event('pointerup'))
    expect(pegmanDragging.value).toBe(false)
  })

  /**
   * Google walks and turns on the arrow keys but never cancels them, so the same press scrolled
   * the page out from under the board.
   */
  it('keeps the arrow keys from scrolling the page as well', async () => {
    const element = document.createElement('div')
    const { mount } = useStreetView()
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
    const { mount, toWorldMap } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    toWorldMap()

    expect(FakeMap.instances[0]!.panorama.setVisible).toHaveBeenCalledWith(false)
  })
})
