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
  private readonly handlers = new Map<string, Array<() => void>>()

  setOptions = vi.fn()
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
  getStreetView = vi.fn(() => this.panorama)

  constructor(
    readonly element: unknown,
    readonly options: Record<string, unknown>,
  ) {
    FakeMap.instances.push(this)
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

  it('moves the Pegman off the corner and configures nothing else about it', async () => {
    const { mount } = useStreetView()

    const pending = mount(document.createElement('div'))
    await flushPromises()
    triggerScriptLoad(script)
    await pending

    // `position` is the only key this control accepts. `sources: [OUTDOOR]` is the tempting one
    // and the API throws on it while building the control — leaving a map with no Pegman, hence
    // no way into Street View at all.
    const options = FakeMap.instances[0]!.options
    expect(options.streetViewControl).toBe(true)
    expect(options.streetViewControlOptions).toEqual({ position: 7 })
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
