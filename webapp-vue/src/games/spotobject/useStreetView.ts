/**
 * The Maps JavaScript API, loaded once per document and shared.
 *
 * The one rule that must not be broken here: **never construct a `StreetViewPanorama`.** The map's
 * own default panorama (`map.getStreetView()`) costs nothing — measured — while every constructed
 * panorama object is a billed Dynamic Street View event. Walking around is the whole game, so the
 * difference is not marginal.
 *
 * The key comes from `/api/spot-object/config` rather than from a build-time variable: the SPA
 * bundle is identical on staging and production, so the bundle cannot know its environment — the
 * server does.
 */
/// <reference types="google.maps" />
import { reactive, ref } from 'vue'
import type { Ref } from 'vue'
import { apiFetch } from '@/api/client'
import type { SpotObjectTip } from './types'

/**
 * What the board renders: whether a panorama is open at all, and which one. The *view* inside it
 * is deliberately not here — see `currentTip`.
 */
export interface StreetViewState {
  visible: boolean
  panoId: string | null
}

const CALLBACK_NAME = '__spotObjectMapsReady'

/** One script tag for the whole document, however many boards ask for it. */
let mapsPromise: Promise<void> | null = null

function loadMapsApi(apiKey: string): Promise<void> {
  mapsPromise ??= new Promise<void>((resolve, reject) => {
    const global = window as typeof window & Record<string, () => void>
    global[CALLBACK_NAME] = () => resolve()
    const script = document.createElement('script')
    // `loading=async` is the half Google warns about when it is missing; `script.async` alone
    // does not satisfy it. The callback contract is unchanged — that is what this pattern is for.
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&callback=${CALLBACK_NAME}`
    script.async = true
    script.onerror = () => reject(new Error('failed to load the Google Maps script'))
    document.head.append(script)
  }).catch((err: unknown) => {
    // Only a *successful* load may be cached: a rejected promise kept here would answer every
    // later mount instantly without appending a script tag, and the error face's
    // „Versuch es später noch einmal“ would have no path that can succeed.
    mapsPromise = null
    throw err
  })
  return mapsPromise
}

export interface UseStreetView {
  error: Ref<string | null>
  mount: (element: HTMLElement) => Promise<void>
  pano: StreetViewState
  /** The tip for the view on screen right now, or `null` while no panorama is open. */
  currentTip: () => SpotObjectTip | null
  toWorldMap: () => void
}

export function useStreetView(): UseStreetView {
  const error = ref<string | null>(null)
  const pano = reactive<StreetViewState>({ visible: false, panoId: null })
  let panorama: google.maps.StreetViewPanorama | null = null

  async function mount(element: HTMLElement): Promise<void> {
    try {
      const config = await apiFetch<{ mapsApiKey: string }>('/api/spot-object/config')
      await loadMapsApi(config.mapsApiKey)

      const map = new google.maps.Map(element, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        gestureHandling: 'greedy',
        // No `streetViewControlOptions` beside it: `sources: [OUTDOOR]` is the one option worth
        // setting there and the API rejects it outright — "OUTDOOR source not supported on
        // StreetViewControlOptions", thrown while the control is built, which leaves the map
        // standing but Pegman-less. No Pegman, no way into Street View at all.
        streetViewControl: true,
        mapTypeControl: false,
        fullscreenControl: false,
      })

      // Coverage stays on permanently: saying „ich suche jetzt in Barcelona“ needs to see where
      // there is anything to walk into. Takes no options of its own.
      new google.maps.StreetViewCoverageLayer().setMap(map)

      // The map's own default panorama — never `new google.maps.StreetViewPanorama(...)`.
      panorama = map.getStreetView()
      panorama.setOptions({
        addressControl: false,
        showRoadLabels: false,
        panControl: false,
        enableCloseButton: false,
        fullscreenControl: false,
        // The phone-shaped control, offered on anything that reports an orientation sensor —
        // a laptop with a lid sensor included. Tilting a device to look around is not this
        // game's gesture, and the control sits in the corner explaining itself to nobody.
        motionTracking: false,
        motionTrackingControl: false,
      })

      panorama.addListener('visible_changed', () => {
        pano.visible = panorama?.getVisible() ?? false
      })
      panorama.addListener('pano_changed', () => {
        pano.panoId = panorama?.getPano() || null
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'failed to load the map'
    }
  }

  /**
   * Asked once, at the click on „Gefunden“ — never mirrored into reactive state. Panning fires
   * `pov_changed` and zooming fires `zoom_changed`, so any mirror is exactly as current as the set
   * of events it subscribes to; a getter cannot be stale. The player turns to face what they found
   * *after* arriving, and that turn is the whole point of the tip.
   */
  function currentTip(): SpotObjectTip | null {
    const panoId = panorama?.getPano()
    if (!panorama || !panoId) return null
    const pov = panorama.getPov()
    return { panoId, heading: pov.heading, pitch: pov.pitch, zoom: panorama.getZoom() }
  }

  /** Whoever lands on a single photo — the Pegman drops onto indoor and user shots too — uses this to get out. */
  function toWorldMap(): void {
    panorama?.setVisible(false)
  }

  return { error, mount, pano, currentTip, toWorldMap }
}
