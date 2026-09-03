/**
 * The nearest panorama to a press, within a finger's reach.
 *
 * `setPosition` did this before and searched a fixed 50 **metres** — which is a fine target at
 * zoom 17, where it is about 55 px across, and a hopeless one at zoom 14, where it is about 7 px.
 * Zoom 14 is where Google starts drawing the blue coverage lines, so it is exactly where people
 * search: on a phone the press almost never landed.
 *
 * A radius in metres cannot be right at every zoom, so it is derived from one that can: a finger.
 * The press reaches as far as it looks like it reaches, which is what makes a dropped Pegman feel
 * so forgiving.
 *
 * `StreetViewService` was ruled out when the game was designed, as „a new cost surface for the
 * same answer“. That was a cost decision rather than a technical one, and the measurement we made
 * later says the opposite: Google's Street View documentation puts the built-in Pegman view and
 * this service on the same free footing, which is also what `GoogleCountryLookup` already relies
 * on for the metadata endpoint. Worth re-checking under Billing → Reports → Group by SKU; if it
 * ever shows up there, this one function is the whole seam to move to the backend.
 */
/// <reference types="google.maps" />

/** A finger, in CSS pixels. */
const REACH_PX = 44

/** Never shorter than what `setPosition` reached on its own. */
const MIN_RADIUS_M = 50

/** And never a walk across town, however far out the map is zoomed. */
const MAX_RADIUS_M = 400

/** Ground resolution in Web Mercator — the projection Google draws these tiles in. */
function metresPerPixel(map: google.maps.Map): number {
  const zoom = map.getZoom() ?? 0
  const latitude = map.getCenter()?.lat() ?? 0
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
}

export function reachOf(map: google.maps.Map): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, REACH_PX * metresPerPixel(map)))
}

/**
 * The panorama a press means, or `null` when there is none within reach. Unlike the status of a
 * panorama that has already been moved, this answer is definite: it is per request, so nothing has
 * to be inferred from an event that only fires when something *changes*.
 */
export async function panoAt(map: google.maps.Map, at: google.maps.LatLng): Promise<string | null> {
  const service = new google.maps.StreetViewService()

  return (
    service
      .getPanorama({ location: at, radius: reachOf(map) })
      .then((response) => response.data.location?.pano ?? null)
      // Nothing within reach rejects rather than resolving, and so does a network that is not there.
      // Both mean the same thing to a player: not here.
      .catch(() => null)
  )
}
