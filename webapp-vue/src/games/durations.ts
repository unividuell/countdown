/** `mm:ss` with minutes running past 59 — the clock measures a round, not a wall clock. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Faster first, by the millisecond the server measured — never by comparing the `mm:ss` label as
 * text, which inverts past two-digit minutes (`"100:00"` sorts before `"60:00"`). A row without a
 * clock sorts after one with it rather than winning by default.
 */
export function durationOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** Whether the clock column has anything to show: a round that does not score on time has no label. */
export function hasDurations(rows: readonly { durationLabel?: string | null }[]): boolean {
  return rows.some((row) => (row.durationLabel ?? null) !== null)
}
