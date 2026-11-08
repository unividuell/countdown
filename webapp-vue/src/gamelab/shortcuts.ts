export type LabShortcut = 'forgetMine' | 'reset' | 'roll' | 'switchPlayer'

// Bare keys only: browsers own every modifier combination (⌘R reloads, ⌘⇧W closes the window),
// but never a plain letter. A held key repeats nothing — one press, one roll.
const KEYS: Record<string, LabShortcut> = {
  r: 'roll',
  w: 'switchPlayer',
  x: 'reset',
  z: 'forgetMine',
}

export function labShortcut(event: KeyboardEvent): LabShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return null
  return KEYS[event.key.toLowerCase()] ?? null
}
