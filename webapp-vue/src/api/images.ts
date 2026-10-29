import { apiFetch } from '@/api/client'

export interface ImageResponse {
  id: string
  width: number
  height: number
  byteSize: number
  createdAt: string
  uploadedBy: string
}

export interface ImageListResponse {
  images: ImageResponse[]
  used: number
  limit: number
  /** Whether this listing is the whole pool. False means it holds only the viewer's own uploads. */
  viewerIsAdmin: boolean
}

export const communityImagesBase = (slug: string): string =>
  `/api/communities/${encodeURIComponent(slug)}/images`
export const globalImagesBase = (): string => '/api/super-admin/images'

export const thumbUrl = (base: string, id: string): string => `${base}/${id}/thumb`
export const originalUrl = (base: string, id: string): string => `${base}/${id}`

export const listImages = (base: string) => apiFetch<ImageListResponse>(base)
export const deleteImage = (base: string, id: string) =>
  apiFetch<void>(`${base}/${id}`, { method: 'DELETE' })
