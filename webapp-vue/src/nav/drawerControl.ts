const closeListeners = new Set<() => void>()

export function onDrawerCloseRequested(listener: () => void): () => void {
  closeListeners.add(listener)
  return () => closeListeners.delete(listener)
}

export function requestDrawerClose(): void {
  for (const listener of [...closeListeners]) listener()
}
