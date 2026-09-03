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
import { onMapPress } from './mapPress'
import type { SpotObjectTip } from './types'
import { useWalkMap } from './useWalkMap'

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

/**
 * Arrow keys walk and turn inside Street View, and pan the map — Google handles them on its own
 * element without cancelling them, so the same press also scrolls the page out from under the
 * board. Cancelled here, on the way out: Google's handler has already run by then, so only the
 * browser's own scroll is taken away, and only for a press that started inside the map.
 */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** How long Google gets to answer a press before its status is read rather than waited for. */
const LOOKUP_GRACE_MS = 1000

function swallowScrollKeys(element: HTMLElement): void {
  element.addEventListener('keydown', (event) => {
    if (SCROLL_KEYS.has(event.key)) event.preventDefault()
  })
}

export interface UseStreetView {
  error: Ref<string | null>
  mount: (element: HTMLElement) => Promise<void>
  pano: StreetViewState
  /** True while the last attempt found nothing and the map has not been moved since. */
  noCoverage: Ref<boolean>
  /**
   * The direction the open panorama faces, for the compass to read. Display only — a tip still
   * takes its heading from `currentTip` at the moment of the click.
   */
  heading: Ref<number | null>
  /** The tip for the view on screen right now, or `null` while no panorama is open. */
  currentTip: () => SpotObjectTip | null
  toWorldMap: () => void
  /** Back into the panorama that is still loaded, exactly where it was left. */
  toPanorama: () => void
  /** Builds the mini-map into `element` on the first open — see `useWalkMap`. */
  openMiniMap: (element: HTMLElement) => Promise<void>
  /** True while the last tap on the mini-map found nothing. */
  jumpMissed: Ref<boolean>
}

export interface StreetViewDeps {
  /** The player's own colour, which only the round knows. */
  trailColor: Ref<string>
  /** The board is locked — a press must not walk into anything. */
  locked: Ref<boolean>
}

export function useStreetView({ trailColor, locked }: StreetViewDeps): UseStreetView {
  const error = ref<string | null>(null)
  const pano = reactive<StreetViewState>({ visible: false, panoId: null })
  const noCoverage = ref(false)
  const heading = ref<number | null>(null)
  let map: google.maps.Map | null = null
  let panorama: google.maps.StreetViewPanorama | null = null
  /** A press waiting for Google to say whether there was anything there. */
  let asking: ReturnType<typeof setTimeout> | null = null
  const walk = useWalkMap(trailColor)

  async function mount(element: HTMLElement): Promise<void> {
    try {
      const config = await apiFetch<{ mapsApiKey: string }>('/api/spot-object/config')
      await loadMapsApi(config.mapsApiKey)

      map = new google.maps.Map(element, {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        gestureHandling: 'greedy',
        // Kept beside the press on the map rather than replaced by it: `setPosition` searches a
        // fixed 50 m, so below the zoom where the blue lines are drawn a press finds nothing and
        // the Pegman is the only way in. Half way down the right edge rather than the API's
        // bottom-right default: on a phone held in the right hand that corner is under the thumb's
        // own knuckle. `position` is the only option this control accepts — `sources: [OUTDOOR]`
        // is rejected outright ("OUTDOOR source not supported on StreetViewControlOptions") and
        // takes the whole control down with it, leaving a map with no way into Street View at all.
        streetViewControl: true,
        streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        mapTypeControl: false,
        fullscreenControl: false,
      })

      // Coverage stays on permanently: saying „ich suche jetzt in Barcelona“ needs to see where
      // there is anything to walk into — and it is what a press is aimed at, which reaches only
      // 50 m. Takes no options of its own.
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
        heading.value = panorama?.getPov().heading ?? null

        // The world map walks along underneath, so „← Weltkarte“ comes out where the player
        // stopped rather than where they went in.
        const position = panorama?.getPosition()
        if (position) map?.setCenter(position)
      })

      // Turning fires this and nothing else, which is why the compass cannot ride on `pano_changed`.
      panorama.addListener('pov_changed', () => {
        heading.value = panorama?.getPov().heading ?? null
      })

      // A miss is answered by us rather than by Google's grey „no imagery“ panel: the panorama
      // goes back out of sight and the crosshair says there is nothing to walk into here.
      panorama.addListener('status_changed', () => {
        if (!panorama || panorama.getStatus() === 'OK') return
        // A mistap inside the mini-map is the walk map's own to undo: hiding the panorama here
        // would drop the player onto the world map and throw their walk away.
        if (walk.absorbMiss()) return
        panorama.setVisible(false)
        noCoverage.value = true
      })

      // „Hier“ is the whole of that notice, so moving the map is what withdraws it.
      map.addListener('center_changed', () => {
        noCoverage.value = false
      })

      walk.attach({ map, panorama })

      // Both maps take the same press, and this is the board's own. It replaces a ring floating
      // over the map's centre: aiming with a finger beats aiming by panning, and Google's own
      // click event needs none of the pointer arithmetic that ring did.
      onMapPress(map, enterAt)

      swallowScrollKeys(element)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'failed to load the map'
    }
  }

  /**
   * Asked once, at the click on „Gefunden“ — never assembled from mirrored state. Panning fires
   * `pov_changed` and zooming fires `zoom_changed`, so any mirror is exactly as current as the set
   * of events it subscribes to; a getter cannot be stale. The player turns to face what they found
   * *after* arriving, and that turn is the whole point of the tip.
   *
   * `heading` is such a mirror and is deliberately not read here: it exists for the compass, where
   * being a frame behind costs nothing, and a tip is not the place to find out it was wrong.
   */
  function currentTip(): SpotObjectTip | null {
    const panoId = panorama?.getPano()
    if (!panorama || !panoId) return null
    const pov = panorama.getPov()
    return { panoId, heading: pov.heading, pitch: pov.pitch, zoom: panorama.getZoom() }
  }

  /**
   * Into Street View where the map was pressed.
   *
   * Nothing new is asked of Google: `setPosition` on the map's own panorama is the call a landing
   * Pegman makes, so this costs exactly what dragging cost. `setPosition` takes no radius and
   * searches the standard 50 m, which is why the coverage layer stays on: press a blue line at a
   * zoom where you can see it, and it lands.
   */
  function enterAt(at: google.maps.LatLng): void {
    if (!panorama || locked.value) return

    // Whatever the mini-map was still waiting for is not this press's answer.
    walk.clearJump()
    noCoverage.value = false
    panorama.setPosition(at)
    panorama.setVisible(true)

    // Google's status announces itself only when it *changes*, so a second press onto a place
    // with no imagery is answered by silence — and by Google's own grey „no imagery“ panel, the
    // very thing `status_changed` is listened to here to prevent. Asking once, a moment later,
    // is what catches that press; the event still answers the first one at once. Before the
    // press could be aimed, the map's centre was the only target and refusing to ask twice was
    // enough; a finger can press a second dead spot straight away.
    clearTimeout(asking ?? undefined)
    asking = setTimeout(() => {
      asking = null
      if (!panorama || panorama.getStatus() === 'OK') return
      panorama.setVisible(false)
      noCoverage.value = true
    }, LOOKUP_GRACE_MS)
  }

  /** Whoever lands on a single photo — indoor and user shots are found too — uses this to get out. */
  function toWorldMap(): void {
    panorama?.setVisible(false)
  }

  /**
   * The way back up from the full-screen map. Nothing is looked up: the panorama was only hidden,
   * so showing it again is free and lands on the very panorama the player left, rather than on
   * whatever a fresh 50 m search around the map's centre would find.
   */
  function toPanorama(): void {
    panorama?.setVisible(true)
  }

  return {
    error,
    mount,
    pano,
    noCoverage,
    heading,
    currentTip,
    toWorldMap,
    toPanorama,
    openMiniMap: walk.openMiniMap,
    jumpMissed: walk.jumpMissed,
  }
}
