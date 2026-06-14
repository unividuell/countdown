import { DateTime } from 'luxon'
import type { DurationUnit } from 'luxon'
import type { Round } from '@/api/types'

export interface Chip {
  value: string
  unit: string
}
export interface CountdownView {
  state: 'idle' | 'before' | 'after'
  prefix: string
  label: string
  chips: Chip[]
}
export interface BaseUnitConfig {
  months: boolean
  weeks: boolean
  // days is always-on; the field is retained to mirror the origin's config shape (the cycle never turns it off).
  days: boolean
}

// Magnitude-only formatting: abs() masks sub-tick clock-skew (a few negative seconds render as 00); trunc() floors so a descending timer ticks 03->02->01->00 rather than rounding.
const pad2 = (n?: number) => String(Math.trunc(Math.abs(n ?? 0))).padStart(2, '0')
const whole = (n?: number) => String(Math.trunc(Math.abs(n ?? 0)))

/** Click-to-cycle the higher-order base unit: days -> months+weeks+days -> weeks+days -> days. */
export function nextBaseUnitConfig(cfg: BaseUnitConfig): BaseUnitConfig {
  if (cfg.months) return { months: false, weeks: true, days: true }
  if (cfg.weeks) return { months: false, weeks: false, days: true }
  return { months: true, weeks: true, days: true }
}

/**
 * Pure display projection. Round logic stays on the backend; here we only subtract + format
 * absolute instants. Before start (number >= 0): day count = |number|, h:m:s = round.end - now.
 * After start (number < 0): "event running", count up since startsAt. Weeks/months are a cosmetic
 * calendar re-expression of the time to startsAt.
 */
export function computeView(
  round: Round | null,
  startsAt: string | null,
  zone: string,
  nowMs: number,
  cfg: BaseUnitConfig,
): CountdownView {
  if (!round || !startsAt) return { state: 'idle', prefix: '', label: '', chips: [] }
  const now = DateTime.fromMillis(nowMs, { zone })
  const start = DateTime.fromISO(startsAt, { zone })

  if (round.number < 0) {
    const up = now.diff(start, ['days', 'hours', 'minutes', 'seconds']).toObject()
    return {
      state: 'after',
      prefix: 'T+',
      label: round.label,
      chips: [
        { value: whole(up.days), unit: 'd' },
        { value: pad2(up.hours), unit: 'h' },
        { value: pad2(up.minutes), unit: 'm' },
        { value: pad2(up.seconds), unit: 's' },
      ],
    }
  }

  const lower = DateTime.fromISO(round.end, { zone })
    .diff(now, ['hours', 'minutes', 'seconds'])
    .toObject()
  const chips: Chip[] = []
  if (cfg.months || cfg.weeks) {
    const units: DurationUnit[] = []
    if (cfg.months) units.push('months')
    if (cfg.weeks) units.push('weeks')
    units.push('days')
    const hi = start.diff(now, units).toObject()
    if (hi.months !== undefined) chips.push({ value: whole(hi.months), unit: 'M' })
    if (hi.weeks !== undefined) chips.push({ value: whole(hi.weeks), unit: 'w' })
    chips.push({ value: whole(hi.days), unit: 'd' })
  } else {
    chips.push({ value: whole(round.number), unit: 'd' }) // authoritative day count = |round.number|
  }
  chips.push({ value: pad2(lower.hours), unit: 'h' })
  chips.push({ value: pad2(lower.minutes), unit: 'm' })
  chips.push({ value: pad2(lower.seconds), unit: 's' })
  return { state: 'before', prefix: 'T-', label: round.label, chips }
}

export type BoundaryAction = 'none' | 'shift' | 'refetch'

/** Decide what to do when the clock reaches the current round's end. */
export function boundaryAction(
  round: Round | null,
  nextRound: Round | null,
  nowMs: number,
): BoundaryAction {
  if (!round || nowMs < Date.parse(round.end)) return 'none'
  if (nextRound && nowMs < Date.parse(nextRound.end)) return 'shift'
  return 'refetch'
}
