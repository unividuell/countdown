import { isBlockCode } from './blockTypes'
import type { BlockCode } from './blockTypes'
import { MAX_COORDINATE, MAX_GUESS_BLOCKS } from './types'
import type { CopyBlocksPayload, GuessBlock } from './types'

/**
 * A build of 30 to 58 blocks takes minutes on a phone, and the phone may discard the tab meanwhile.
 * The draft lives on the device, one per player, round and phase:
 *
 *   copy-blocks:draft:<userId>:<1|2>:<fingerprint of the round>
 *
 * Every access is guarded — storage can be absent, full or denied, and the game plays on without.
 */
const PREFIX = 'copy-blocks:draft:'

/** The keys `draftKey` makes, split into the player's part and the rest. */
const OWN_KEY = /^(copy-blocks:draft:.+:)[12]:[0-9a-f]{8}$/

/** FNV-1a over the UTF-8 bytes; 32 bits tell two rounds of one player apart, and need no crypto. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function draftKey(input: {
  userId: string
  payload: CopyBlocksPayload
  timed: boolean
}): string {
  const { grid, types, blocks } = input.payload
  const round = fingerprint(
    JSON.stringify([grid, types, blocks.map((b) => [b.x, b.y, b.z, b.type])]),
  )

  return `${PREFIX}${input.userId}:${input.timed ? 2 : 1}:${round}`
}

/** `null` where even reaching `localStorage` throws (denied cookies, sandboxed frames). */
export function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** One stored block, or `null` for anything the board could not have written. */
function readBlock(raw: unknown, types: readonly BlockCode[]): GuessBlock | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [x, y, z, type] = raw as unknown[]
  for (const axis of [x, y, z]) {
    if (!Number.isInteger(axis) || Math.abs(axis as number) > MAX_COORDINATE) return null
  }
  if (!isBlockCode(type) || !types.includes(type)) return null

  return { x: x as number, y: y as number, z: z as number, type }
}

/** The saved build; an entry that cannot be read is removed, not repaired. */
export function loadDraft(
  storage: Storage | null,
  key: string,
  types: readonly BlockCode[],
): GuessBlock[] | null {
  if (storage === null) return null

  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const blocks = readBlocks(raw, types)
    if (blocks === null) storage.removeItem(key)

    return blocks
  } catch {
    return null
  }
}

function readBlocks(raw: string, types: readonly BlockCode[]): GuessBlock[] | null {
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof stored !== 'object' || stored === null) return null

  const { v, blocks } = stored as { v?: unknown; blocks?: unknown }
  if (v !== 1 || !Array.isArray(blocks) || blocks.length > MAX_GUESS_BLOCKS) return null

  const read = blocks.map((block) => readBlock(block, types))
  if (read.some((block) => block === null)) return null

  const guess = read as GuessBlock[]
  const cells = new Set(guess.map((b) => `${b.x},${b.y},${b.z}`))

  return cells.size === guess.length ? guess : null
}

export function saveDraft(
  storage: Storage | null,
  key: string,
  blocks: readonly GuessBlock[],
): void {
  try {
    storage?.setItem(
      key,
      JSON.stringify({ v: 1, blocks: blocks.map((b) => [b.x, b.y, b.z, b.type]) }),
    )
  } catch {
    // Full or denied: the build lives on in memory.
  }
}

export function clearDraft(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Nothing to clear that could be reached.
  }
}

/**
 * Opening a round drops the same player's drafts of every other round and phase. Keys are
 * collected before any is removed: removing shifts the indices `key(i)` walks.
 */
export function sweepDrafts(storage: Storage | null, keep: string): void {
  const prefix = OWN_KEY.exec(keep)?.[1]
  if (storage === null || prefix === undefined) return

  try {
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null && key !== keep && key.startsWith(prefix)) stale.push(key)
    }

    for (const key of stale) storage.removeItem(key)
  } catch {
    // Stale drafts stay; harmless, and the next open sweeps again.
  }
}
