import { fingerprint } from '../drafts'
import type { Placement, Point } from './gestures'
import { finite, positive, type MatchScalePayload } from './types'

export { clearDraft, deviceStorage } from '../drafts'

/**
 * The player's unsent placement lives on the device, one per player, round and phase:
 *
 *   match-scale:draft:<userId>:<1|2>:<fingerprint of the round>
 *
 * Every access is guarded — storage can be absent, full or denied, and the game plays on without.
 */
const PREFIX = 'match-scale:draft:'

/** B's placement, and the view the player had on it. A is fixed, so it is not stored. */
export interface Draft {
  v: 1
  b: Placement
  zoom: number
  centre: Point
}

export function draftKey(input: {
  userId: string
  payload: MatchScalePayload
  timed: boolean
}): string {
  const { a, b } = input.payload
  const round = fingerprint(JSON.stringify([a.path, b.path]))

  return `${PREFIX}${input.userId}:${input.timed ? 2 : 1}:${round}`
}

/** The saved draft; an entry that cannot be read is removed, not repaired. */
export function loadDraft(storage: Storage | null, key: string): Draft | null {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const draft = readDraft(raw)
    if (draft === null) storage.removeItem(key)

    return draft
  } catch {
    return null
  }
}

function readDraft(raw: string): Draft | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null) return null

  const { v, b, zoom, centre } = stored as Record<string, unknown>
  const point = readPoint(centre)
  const placement = readPoint(b)
  const scale = (b as { scale?: unknown } | null)?.scale
  if (v !== 1 || point === null || placement === null) return null
  if (!positive(scale) || !positive(zoom)) return null

  return { v: 1, b: { ...placement, scale }, zoom, centre: point }
}

function readPoint(value: unknown): Point | null {
  if (typeof value !== 'object' || value === null) return null

  const { x, y } = value as { x?: unknown; y?: unknown }

  return finite(x) && finite(y) ? { x, y } : null
}

export function saveDraft(storage: Storage | null, key: string, draft: Draft): void {
  try {
    storage?.setItem(key, JSON.stringify(draft))
  } catch {
    // Full or denied: the placement lives on in memory.
  }
}
