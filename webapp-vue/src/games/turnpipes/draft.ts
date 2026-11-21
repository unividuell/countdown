import { fingerprint, sweepDrafts as sweepSharedDrafts } from '../drafts'
import type { TurnPipesPayload } from './types'

export { clearDraft, deviceStorage } from '../drafts'

/**
 * A board takes minutes on a phone, and the phone may discard the tab meanwhile. The draft lives
 * on the device, one per player, round and phase:
 *
 *   turn-pipes:draft:<userId>:<1|2>:<fingerprint of the round>
 *
 * Every access is guarded — storage can be absent, full or denied, and the game plays on without.
 */
const PREFIX = 'turn-pipes:draft:'

/** The keys `draftKey` makes, split into the player's part and the rest. */
const OWN_KEY = /^(turn-pipes:draft:.+:)[12]:[0-9a-f]{8}$/

export function draftKey(input: {
  userId: string
  payload: TurnPipesPayload
  timed: boolean
}): string {
  const { size, kinds, start } = input.payload
  const round = fingerprint(JSON.stringify([size, kinds, start]))

  return `${PREFIX}${input.userId}:${input.timed ? 2 : 1}:${round}`
}

/** The saved rotations; an entry that cannot be read is removed, not repaired. */
export function loadDraft(storage: Storage | null, key: string, size: number): number[] | null {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const rotations = readRotations(raw, size * size)
    if (rotations === null) storage.removeItem(key)

    return rotations
  } catch {
    return null
  }
}

function readRotations(raw: string, cells: number): number[] | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null) return null

  const { v, rotations } = stored as { v?: unknown; rotations?: unknown }
  if (v !== 1 || !Array.isArray(rotations) || rotations.length !== cells) return null
  if (!rotations.every((turn) => Number.isInteger(turn) && turn >= 0 && turn <= 3)) return null

  return rotations as number[]
}

export function saveDraft(
  storage: Storage | null,
  key: string,
  rotations: readonly number[],
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(key, JSON.stringify({ v: 1, at: now, rotations }))
  } catch {
    // Full or denied: the board lives on in memory.
  }
}

/** Opening a round drops the same player's stale drafts of other rounds and phases. */
export function sweepDrafts(storage: Storage | null, keep: string, now: number = Date.now()): void {
  const prefix = OWN_KEY.exec(keep)?.[1]
  if (prefix === undefined) return

  sweepSharedDrafts(storage, prefix, keep, now)
}
