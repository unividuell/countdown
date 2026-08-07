import type { CommunitySummary } from '@/api/types'

export interface CommunityEntry {
  id: string
  name: string
  slug: string
  /** The community in context: shown, greyed out, not navigable. */
  current: boolean
}

/**
 * The switcher's rows. The community in context stays in the list rather than being filtered
 * out — greyed out it answers "where am I" without the reader having to count.
 *
 * localeCompare('de'), not `<`: 'Ä' sits after 'Z' by code point, so a naive comparison sorts
 * every umlaut community to the end.
 */
export function communityEntries(
  list: readonly CommunitySummary[],
  activeSlug: string | null,
): CommunityEntry[] {
  return [...list]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, current: c.slug === activeSlug }))
}

/**
 * How far a wheel of diameter `wheelPx` turns while rolling `travelPx`, in degrees.
 *
 * The avatar drives the drawer like a wheel on a rail, so the angle has to follow the drawer's
 * actual width — a constant would only be right on the viewport it was written for.
 */
export function spinDegrees(travelPx: number, wheelPx: number): number {
  if (wheelPx <= 0) return 0
  return (travelPx / (wheelPx / 2)) * (180 / Math.PI)
}
