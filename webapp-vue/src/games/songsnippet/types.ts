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
