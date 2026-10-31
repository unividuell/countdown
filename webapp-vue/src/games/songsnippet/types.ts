/** The sealed clip for a stage: its key arrives with that stage, no earlier. */
export const clipAsset = (stage: number): string => `clip-${stage}`

/** The solution's hook: plain, served only after the guess. */
export const SOLUTION_ASSET = 'solution'

export interface SongSnippetPayload {
  stageDurationsSeconds: number[]
}
export interface SongSnippetSolution {
  artist: string
  title: string
  coverUrl: string | null
  link: string
}
export interface SongSnippetGuessWire {
  trackId: number
  artist: string
  title: string
}
/** Narrowed, not cast: `payload` is `unknown` by contract, and a stale round may be junk. */
export function asSongSnippetPayload(value: unknown): SongSnippetPayload | null {
  if (typeof value !== 'object' || value === null) return null

  const { stageDurationsSeconds } = value as Record<string, unknown>
  if (!Array.isArray(stageDurationsSeconds)) return null
  if (!stageDurationsSeconds.every((seconds) => typeof seconds === 'number')) return null
  return { stageDurationsSeconds }
}

/** Narrowed like the payload. A missing cover is no cover — the server writes `null` for one. */
export function asSongSnippetSolution(value: unknown): SongSnippetSolution | null {
  if (typeof value !== 'object' || value === null) return null

  const { artist, title, coverUrl, link } = value as Record<string, unknown>
  if (typeof artist !== 'string' || typeof title !== 'string' || typeof link !== 'string') {
    return null
  }
  return { artist, title, coverUrl: typeof coverUrl === 'string' ? coverUrl : null, link }
}
