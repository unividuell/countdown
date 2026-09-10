import { apiFetch, csrfHeader, notifyUnauthorized } from '@/api/client'

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
}

/** The refusal's `code` from the server's problem+json, or NETWORK when nothing answered. */
export class UploadError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`upload failed: ${code}`)
    this.name = 'UploadError'
  }
}

export const communityImagesBase = (slug: string): string =>
  `/api/communities/${encodeURIComponent(slug)}/images`
export const globalImagesBase = (): string => '/api/super-admin/images'

export const thumbUrl = (base: string, id: string): string => `${base}/${id}/thumb`
export const originalUrl = (base: string, id: string): string => `${base}/${id}`

export const listImages = (base: string) => apiFetch<ImageListResponse>(base)
export const deleteImage = (base: string, id: string) =>
  apiFetch<void>(`${base}/${id}`, { method: 'DELETE' })

/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract AND bounded by a 10s timeout that a
 * 5 MB upload over mobile data blows through. XMLHttpRequest rather than fetch because fetch has no
 * upload progress, and 5 MB without a bar looks like a crash on a phone.
 */
export function uploadImage(
  base: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', base)
    xhr.withCredentials = true
    for (const [name, value] of Object.entries(csrfHeader())) xhr.setRequestHeader(name, value)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as ImageResponse)
        return
      }
      if (xhr.status === 401) notifyUnauthorized()
      // A body that isn't problem+json (proxy/gateway error page) leaves nothing to report
      // beyond "no code" -- same as a request that never got an answer at all.
      let code = 'NETWORK'
      try {
        code = (JSON.parse(xhr.responseText) as { code?: string }).code ?? 'NETWORK'
      } catch {
        // unparseable body: code stays 'NETWORK'
      }
      reject(new UploadError(code, xhr.status))
    }

    xhr.onerror = () => reject(new UploadError('NETWORK', 0))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
