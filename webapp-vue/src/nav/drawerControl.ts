/**
 * One direction only: a page asks the drawer to close, and never the other way round. `NavDrawer`
 * keeps sole ownership of its open state — lifting it into a prop would put the global app shell
 * in the business of knowing which page is open, and a DOM event would carry no types at all.
 *
 * Listeners are copied before the call so a listener that unsubscribes itself while closing does
 * not disturb the iteration.
 */
const closeListeners = new Set<() => void>()

export function onDrawerCloseRequested(listener: () => void): () => void {
  closeListeners.add(listener)
  return () => closeListeners.delete(listener)
}

export function requestDrawerClose(): void {
  for (const listener of [...closeListeners]) listener()
}
