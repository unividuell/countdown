import { fingerprint } from '../drafts'
import { pinsOf, ringsOf } from './types'
import type { EchoLocatePayload, Point } from './types'

/** What a player has set on the field and not yet handed in. The pings live on the server. */
export interface EchoDraft {
  rings: number[][]
  pins: Point[]
}

/**
 * A round takes minutes on a phone, and the phone may discard the tab meanwhile. The draft lives
 * on the device, one per player and round:
 *
 *   echo-locate:draft:<userId>:<fingerprint of the first clip's address>
 *
 * The clip's address names the round (`?round=…`), so it tells two rounds apart. Every access is
 * guarded — storage can be absent, full or denied, and the game plays on without.
 */
const PREFIX = 'echo-locate:draft:'

/** The start of every key of one player: what a sweep of that player's drafts goes by. */
export function draftPrefix(userId: string): string {
  return `${PREFIX}${userId}:`
}

export function draftKey(input: { userId: string; assetUrl: string }): string {
  return `${draftPrefix(input.userId)}${fingerprint(input.assetUrl)}`
}

/** The saved draft; an entry that cannot be read is removed, not repaired. */
export function loadDraft(
  storage: Storage | null,
  key: string,
  payload: EchoLocatePayload,
): EchoDraft | null {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const draft = readDraft(raw, payload)
    if (draft === null) storage.removeItem(key)

    return draft
  } catch {
    return null
  }
}

function readDraft(raw: string, payload: EchoLocatePayload): EchoDraft | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null) return null

  const { v, rings, pins } = stored as { v?: unknown; rings?: unknown; pins?: unknown }
  if (v !== 1) return null

  // Read as the server reads a guess, except that pins may still be missing.
  const ringed = ringsOf(rings, payload)
  const pinned = pinsOf(pins, payload, { complete: false })

  return ringed === null || pinned === null ? null : { rings: ringed, pins: pinned }
}

export function saveDraft(
  storage: Storage | null,
  key: string,
  draft: EchoDraft,
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(key, JSON.stringify({ v: 1, at: now, rings: draft.rings, pins: draft.pins }))
  } catch {
    // Full or denied: the draft lives on in memory.
  }
}
