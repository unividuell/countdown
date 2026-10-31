import { fingerprint } from '../drafts'
import type { PaintState } from './paintHistory'
import { strokesOf } from './types'

/**
 * A painting takes minutes on a phone, and the phone may discard the tab meanwhile. The draft
 * lives on the device, one per player and round:
 *
 *   paint-ratio:draft:<userId>:<fingerprint of the template's address>
 *
 * The template's address names the round (`?round=…`), so it tells two rounds apart. Every access
 * is guarded — storage can be absent, full or denied, and the game plays on without.
 */
const PREFIX = 'paint-ratio:draft:'

/** The start of every key of one player: what a sweep of that player's drafts goes by. */
export function draftPrefix(userId: string): string {
  return `${PREFIX}${userId}:`
}

export function draftKey(input: { userId: string; assetUrl: string }): string {
  return `${draftPrefix(input.userId)}${fingerprint(input.assetUrl)}`
}

/** The saved painting; an entry that cannot be read is removed, not repaired. */
export function loadDraft(
  storage: Storage | null,
  key: string,
  brushCount: number,
): PaintState | null {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const state = readState(raw, brushCount)
    if (state === null) storage.removeItem(key)

    return state
  } catch {
    return null
  }
}

function readState(raw: string, brushCount: number): PaintState | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null) return null

  const { v, strokes, redo } = stored as { v?: unknown; strokes?: unknown; redo?: unknown }
  if (v !== 1) return null

  // Each list is read as the server reads a guess: anything off drops the whole draft.
  const painted = strokesOf({ strokes }, brushCount)
  const undone = strokesOf({ strokes: redo }, brushCount)

  return painted === null || undone === null ? null : { strokes: painted, redo: undone }
}

export function saveDraft(
  storage: Storage | null,
  key: string,
  state: PaintState,
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(
      key,
      JSON.stringify({ v: 1, at: now, strokes: state.strokes, redo: state.redo }),
    )
  } catch {
    // Full or denied: the painting lives on in memory.
  }
}
