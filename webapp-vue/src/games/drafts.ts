/**
 * What every game's on-device draft shares: reaching the storage, naming a round, clearing and
 * sweeping. A game keys its drafts `<game>:draft:<userId>:…` and adds its own load and save.
 */

/** A round lasts a day: a draft saved two days ago belongs to no round still open. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

/** `null` where even reaching `localStorage` throws (denied cookies, sandboxed frames). */
export function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** FNV-1a over the UTF-8 bytes; 32 bits tell two rounds of one player apart, and need no crypto. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function clearDraft(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Nothing to clear that could be reached.
  }
}

/** When a draft was saved; `null` for anything without a readable time. */
function savedAt(raw: string | null): number | null {
  try {
    const at = (JSON.parse(raw ?? '') as { at?: unknown } | null)?.at

    return typeof at === 'number' && Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

/**
 * Opening a round drops the same player's stale drafts of other rounds and phases. A fresh one may
 * be another community's round of the same day, so only drafts older than `STALE_AFTER_MS` go — and
 * those without a readable time. Keys are collected before any is removed: removing shifts the
 * indices `key(i)` walks.
 */
export function sweepDrafts(
  storage: Storage | null,
  prefix: string,
  keep: string,
  now: number = Date.now(),
): void {
  if (storage === null) return

  try {
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key === null || key === keep || !key.startsWith(prefix)) continue

      const at = savedAt(storage.getItem(key))
      if (at === null || now - at > STALE_AFTER_MS) stale.push(key)
    }

    for (const key of stale) storage.removeItem(key)
  } catch {
    // Stale drafts stay; harmless, and the next open sweeps again.
  }
}
