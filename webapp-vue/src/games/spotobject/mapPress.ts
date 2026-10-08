/**
 * A press on a Google map that means „go here“, told apart from the first half of a double click.
 *
 * Double clicking is Google's own zoom and stays that way, on both maps. The API makes that cheap:
 * a double click arrives as `click`, `click`, `dblclick`, in that order, so a press only has to
 * wait long enough for a `dblclick` to overtake it. Turning the zoom off instead — which the
 * mini-map did at first — costs a gesture nobody wants to lose to save one timer.
 *
 * This is what is left of the board's old centre-tap watcher. That one read raw pointer events off
 * the map element and had to work out on its own what a drag, a repeat and a hit inside the ring
 * were, because the press it served was a button floating over the map. Asking the map itself
 * removes all three questions, and the press lands where the finger is rather than where the map
 * happens to be centred.
 */
/// <reference types="google.maps" />

/** How long a press waits to find out whether it was the first half of a double click. */
const DOUBLE_TAP_MS = 280

export function onMapPress(map: google.maps.Map, press: (at: google.maps.LatLng) => void): void {
  let pending: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (pending === null) return
    clearTimeout(pending)
    pending = null
  }

  map.addListener('click', (event: google.maps.MapMouseEvent) => {
    // The second press of a double click must schedule nothing of its own, or the double click
    // ends up doing what a single one does, only later.
    cancel()
    const at = event.latLng
    if (!at) return

    pending = setTimeout(() => {
      pending = null
      press(at)
    }, DOUBLE_TAP_MS)
  })

  map.addListener('dblclick', cancel)
}
