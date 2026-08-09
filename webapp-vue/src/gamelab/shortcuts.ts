export type LabShortcut = 'forgetMine' | 'reset'

export function labShortcut(event: KeyboardEvent): LabShortcut | null {
  if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey) return null
  if (event.key.toLowerCase() === 'z') return 'forgetMine'
  if (event.key.toLowerCase() === 'x') return 'reset'
  return null
}
