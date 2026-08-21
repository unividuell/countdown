import { apiFetch } from '@/api/client'

export interface SongSuggestion {
  trackId: number
  artist: string
  title: string
  coverUrl: string | null
}

export interface TrackPreview extends SongSuggestion {
  link: string
  previewUrl: string
}

// `signal` is spread in only when present: `{ signal }` with `signal: undefined` would violate
// `exactOptionalPropertyTypes` on `ApiFetchOptions`, which — like the rest of this codebase's
// optional request fields — distinguishes "absent" from "present but undefined".
export const searchSongs = (q: string, signal?: AbortSignal) =>
  apiFetch<SongSuggestion[]>(
    `/api/song-snippet/search?q=${encodeURIComponent(q)}`,
    signal ? { signal } : {},
  )

/** Fresh preview URL by permanent track id — the reveal plays wrong guesses straight from Deezer. */
export const resolveTrack = (trackId: number) =>
  apiFetch<TrackPreview>(`/api/song-snippet/tracks/${trackId}`)
