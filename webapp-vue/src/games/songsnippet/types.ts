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
export function isSongSnippetPayload(value: unknown): value is SongSnippetPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as SongSnippetPayload).stageDurationsSeconds)
  )
}
