import { apiFetch } from '@/api/client'

export interface AudioClipResponse {
  id: string
  fileName: string
  durationMs: number
  channels: number
  byteSize: number
  createdAt: string
  uploadedBy: string
}

export interface AudioListResponse {
  clips: AudioClipResponse[]
  used: number
  limit: number
  /** Whether this listing is the whole pool. False means it holds only the viewer's own uploads. */
  viewerIsAdmin: boolean
  /** The largest WAV the pool takes. The browser checks its own result against it before sending. */
  maxBytes: number
}

export const communityAudioBase = (slug: string): string =>
  `/api/communities/${encodeURIComponent(slug)}/audio`
export const globalAudioBase = (): string => '/api/super-admin/audio'

export const clipUrl = (base: string, id: string): string => `${base}/${id}`

export const listClips = (base: string) => apiFetch<AudioListResponse>(base)
export const deleteClip = (base: string, id: string) =>
  apiFetch<void>(`${base}/${id}`, { method: 'DELETE' })
