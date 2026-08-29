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

export interface StreetViewState {
  visible: boolean
  panoId: string | null
  heading: number
  pitch: number
  zoom: number
}

const CALLBACK_NAME = '__spotObjectMapsReady'

/** One script tag for the whole document, however many boards ask for it. */
let mapsPromise: Promise<void> | null = null

function loadMapsApi(apiKey: string): Promise<void> {
  mapsPromise ??= new Promise((resolve, reject) => {
    const global = window as typeof window & Record<string, () => void>
    global[CALLBACK_NAME] = () => resolve()
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${CALLBACK_NAME}`
    script.async = true
    script.onerror = () => reject(new Error('failed to load the Google Maps script'))
    document.head.append(script)
  })
  return mapsPromise
}

export interface UseStreetView {
  ready: Ref<boolean>
  error: Ref<string | null>
  mount: (element: HTMLElement) => Promise<void>
  pano: StreetViewState
  toWorldMap: () => void
}

export function useStreetView(): UseStreetView {
  const ready = ref(false)
  const error = ref<string | null>(null)
  const pano = reactive<StreetViewState>({
    visible: false,
    panoId: null,
    heading: 0,
    pitch: 0,
    zoom: 1,
  })
  let panorama: google.maps.StreetViewPanorama | null = null

  async function mount(element: HTMLElement): Promise<void> {
    try {
      const config = await apiFetch<{ mapsApiKey: string }>('/api/spot-object/config')
      await loadMapsApi(config.mapsApiKey)

      const map = new google.maps.Map(element, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        gestureHandling: 'greedy',
        streetViewControl: true,
        // The Pegman control's own search, not the coverage layer's: `OUTDOOR` is documented as
        // unsupported here — measured and accepted, set for correctness, never relied upon.
        streetViewControlOptions: { sources: [google.maps.StreetViewSource.OUTDOOR] },
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
      })

      panorama.addListener('visible_changed', () => {
        pano.visible = panorama?.getVisible() ?? false
      })
      panorama.addListener('pano_changed', () => {
        if (!panorama) return
        pano.panoId = panorama.getPano() || null
        const pov = panorama.getPov()
        pano.heading = pov.heading
        pano.pitch = pov.pitch
        pano.zoom = panorama.getZoom()
      })

      ready.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'failed to load the map'
    }
  }

  /** Whoever lands on a single photo (a `sources: OUTDOOR` gap the Pegman control ignores) uses this to get out. */
  function toWorldMap(): void {
    panorama?.setVisible(false)
  }

  return { ready, error, mount, pano, toWorldMap }
}
