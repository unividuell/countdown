/**
 * Which pictures lie on the reveal's canvas. A layer is the Kollektiv Kommune's picture or a
 * player's painting, named by user id; the list is the stack, bottom first.
 */

/** The picture's id in the stack — no user id looks like it. */
export const KOLLEKTIV = 'kollektiv-kommune'

/** The reveal opens on the picture alone. */
export const DEFAULT_LAYERS: readonly string[] = [KOLLEKTIV]

/** A tap lays the layer on top, or — when it is already there — takes it off again. */
export function toggleLayer(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((layer) => layer !== id) : [...selected, id]
}
