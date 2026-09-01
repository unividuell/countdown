import type { RouterScrollBehavior } from 'vue-router'

/** How long to wait for a round card to mount before giving up and landing at the top. */
export const HASH_WAIT_TIMEOUT_MS = 2000
const POLL_INTERVAL_MS = 50

/**
 * Only a hash vue-router could have built from an element id is worth looking up as one.
 * `document.querySelector` throws a `SyntaxError` on hashes vue-router genuinely produces:
 * `"#"` (an empty target, e.g. from a trailing `#` with nothing after it) and `"#a b"` (a raw
 * space is never valid in an unescaped id selector). `getElementById` sidesteps the selector-
 * syntax question entirely, which is why it is used below instead — this guard only decides
 * whether a hash is worth looking up at all.
 */
function isElementHash(hash: string): boolean {
  return hash.length > 1 && !hash.includes(' ')
}

/**
 * Polls for an element with [id], up to [timeoutMs]. A round card (anchored on `#round-<n>`)
 * fetches its data in `onMounted`, so on the frame this hook runs it is usually not in the DOM yet.
 */
export function waitForElementById(id: string, timeoutMs = HASH_WAIT_TIMEOUT_MS): Promise<boolean> {
  if (document.getElementById(id)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const timer = setInterval(() => {
      if (document.getElementById(id)) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() >= deadline) {
        clearInterval(timer)
        resolve(false)
      }
    }, POLL_INTERVAL_MS)
  })
}

/**
 * A hash is always a round card's own anchor. Nothing inside the app links to one any more — the
 * single-tip page that used to was folded back into the grid — so what is left is a pasted or
 * bookmarked link into one round of the history. `savedPosition` is honoured first: defining this
 * hook at all switches the browser's own back/forward restoration off.
 *
 * Waiting for the target pays off for the currently running round and the one past round
 * `useRoundHistory` loads on its own; a round further back needs a manual "Weiter zurück" click
 * this hook cannot perform on the reader's behalf, so the anchor genuinely never appears for one
 * and the wait times out into the same `{ top: 0 }` it would have landed on anyway.
 */
export const scrollBehavior: RouterScrollBehavior = async (to, _from, savedPosition) => {
  if (savedPosition) return savedPosition
  if (to.hash && isElementHash(to.hash) && (await waitForElementById(to.hash.slice(1)))) {
    return { el: to.hash }
  }
  return { top: 0 }
}
