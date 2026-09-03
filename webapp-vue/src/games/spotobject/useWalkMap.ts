/**
 * Where the player has been, drawn on both maps at once — and the mini-map they walk from.
 *
 * Split out of `useStreetView` rather than added to it: that file owns the one map and the one
 * panorama and the rules about never constructing a second panorama, and everything here is a
 * layer on top of those two objects. It holds no Google objects of its own until `attach`.
 *
 * The trail lives in this module and nowhere else. Google's terms allow us to keep a `panoId`
 * indefinitely but coordinates only for 30 days, so the walk is deliberately a runtime thing:
 * it never reaches a DTO, a store or the server, and it dies with the board.
 */
/// <reference types="google.maps" />
import { nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { onMapPress } from './mapPress'
import { panoAt } from './panoAt'

/**
 * Distance between two dots of the trail. Google measures `repeat` in *screen* pixels rather than
 * metres — the only units the option takes — so a long walk closes into a solid line as the map
 * zooms out. That is the trade the dotted look costs.
 */
const DOT_SPACING = '12px'

/** Close enough to read street names, far enough to see the next junction. */
const MINI_ZOOM = 17

/**
 * The player, as a symbol on the map rather than a mark drawn over it. A mark over it is what this
 * was, and it lied: the map pans under a finger while the mark stays in the middle, so it stopped
 * pointing at where the player actually is. Anchored at the path's own origin, so turning happens
 * about the player and not about a corner.
 *
 * `google.maps.Marker` is deprecated in favour of `AdvancedMarkerElement`, which needs a cloud-side
 * Map ID. One arrow is not worth a second thing to configure per environment.
 */
function cone(color: string, heading: number): google.maps.Symbol {
  return {
    path: 'M 0 -11 L 7 7 L 0 3 L -7 7 Z',
    fillColor: color,
    fillOpacity: 1,
    // A pale player colour vanishes on pale tiles; the outline carries it either way.
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
    strokeOpacity: 1,
    rotation: heading,
  }
}

export interface WalkMapDeps {
  map: google.maps.Map
  panorama: google.maps.StreetViewPanorama
}

export interface UseWalkMap {
  /** Wires the trail to Google's own objects. Everything here is inert until this is called. */
  attach: (deps: WalkMapDeps) => void
  /** Builds the mini-map into `element` the first time, and re-centres it on every open after. */
  openMiniMap: (element: HTMLElement) => Promise<void>
  /** True while the last tap on the mini-map found nothing to walk into. */
  jumpMissed: Ref<boolean>
}

/**
 * A trail of dots rather than a line: Google draws these as one symbol repeated along a line that
 * is itself invisible. The colour is the player's own, so the walk reads as theirs.
 */
function dotted(color: string): google.maps.PolylineOptions {
  return {
    strokeOpacity: 0,
    icons: [
      {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 3,
          fillColor: color,
          fillOpacity: 1,
          // A pale player colour vanishes on pale tiles; the ring carries the dot either way.
          strokeColor: '#ffffff',
          strokeWeight: 1,
        },
        repeat: DOT_SPACING,
      },
    ],
  }
}

export function useWalkMap(trailColor: Ref<string>): UseWalkMap {
  const jumpMissed = ref(false)

  let map: google.maps.Map | null = null
  let panorama: google.maps.StreetViewPanorama | null = null
  let worldTrail: google.maps.Polyline | null = null
  let miniMap: google.maps.Map | null = null
  let miniTrail: google.maps.Polyline | null = null
  let here: google.maps.Marker | null = null

  /** The walk itself. One entry per panorama arrived at, oldest first. */
  const path: google.maps.LatLng[] = []

  /** The last panorama arrived at, so a repeat of it is not counted as a step of its own. */
  let lastPanoId: string | null = null

  watch(trailColor, (color) => {
    worldTrail?.setOptions(dotted(color))
    miniTrail?.setOptions(dotted(color))
    here?.setIcon(cone(color, facing()))
  })

  /** Where the panorama looks right now, straight from Google — never a mirror of it. */
  function facing(): number {
    return panorama?.getPov().heading ?? 0
  }

  function attach(deps: WalkMapDeps): void {
    map = deps.map
    panorama = deps.panorama

    worldTrail = new google.maps.Polyline(dotted(trailColor.value))
    worldTrail.setMap(map)

    panorama.addListener('pano_changed', step)

    // Turning fires this and nothing else, which is why the cone cannot ride on `pano_changed`.
    panorama.addListener('pov_changed', () => {
      here?.setIcon(cone(trailColor.value, facing()))
    })
  }

  /**
   * One step of the walk. Hung on `pano_changed` and not on `position_changed` on purpose:
   * `setPosition` moves the position property straight away and only *then* asks Google whether
   * there is anything there, so a trail built on positions would draw the missed taps too.
   */
  function step(): void {
    const panoId = panorama?.getPano()
    const position = panorama?.getPosition()
    if (!panoId || !position || panoId === lastPanoId) return

    jumpMissed.value = false
    lastPanoId = panoId

    path.push(position)
    worldTrail?.setPath(path)
    miniTrail?.setPath(path)
    here?.setPosition(position)
    miniMap?.setCenter(position)
  }

  async function openMiniMap(element: HTMLElement): Promise<void> {
    if (!panorama) return

    // The panel is `display:none` until the caller's own open flag has reached the DOM, and a map
    // built into a hidden element measures itself as nothing.
    await nextTick()

    miniMap ??= buildMiniMap(element)

    const position = panorama.getPosition()
    if (position) miniMap.setCenter(position)
  }

  function buildMiniMap(element: HTMLElement): google.maps.Map {
    const built = new google.maps.Map(element, {
      zoom: MINI_ZOOM,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
      keyboardShortcuts: false,
    })

    // The same blue lines as on the world map, for the same reason: a tap only lands where there
    // is coverage, so you have to see where that is before you aim.
    new google.maps.StreetViewCoverageLayer().setMap(built)

    miniTrail = new google.maps.Polyline(dotted(trailColor.value))
    miniTrail.setPath(path)
    miniTrail.setMap(built)

    here = new google.maps.Marker({
      map: built,
      position: panorama?.getPosition() ?? null,
      icon: cone(trailColor.value, facing()),
      // A press on the player must still reach the map underneath, or the one spot you are most
      // likely to aim at is the one that cannot be walked to.
      clickable: false,
    })

    onMapPress(built, (at) => void jumpTo(at))

    return built
  }

  /**
   * A press on the mini-map. Asks for the nearest panorama within a finger's reach and goes to it
   * by id — the panorama's own 50 m search was the thing a finger could not hit.
   */
  async function jumpTo(at: google.maps.LatLng): Promise<void> {
    if (!panorama || !miniMap) return

    jumpMissed.value = false
    const pano = await panoAt(miniMap, at)

    if (!pano) {
      jumpMissed.value = true
      return
    }

    panorama.setPano(pano)
  }

  return { attach, openMiniMap, jumpMissed }
}
