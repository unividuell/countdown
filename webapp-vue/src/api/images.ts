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
  /** Whether this listing is the whole pool. False means it holds only the viewer's own uploads. */
  viewerIsAdmin: boolean
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
 * The whole upload is bounded, because the queue is sequential: a connection that stalls without
 * ever failing would otherwise block every remaining file with nothing on screen to explain it.
 * Four minutes is past any upload that can still succeed -- the server caps a file at 15 MB, which
 * is about four minutes at 500 kbit/s -- and far short of forever.
 */
const UPLOAD_TIMEOUT_MS = 240_000

/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract AND bounded by a 10s timeout that a
 * 5 MB upload over mobile data blows through. XMLHttpRequest rather than fetch because fetch has no
 * upload progress, and 5 MB without a bar looks like a crash on a phone.
 */
export function uploadImage(
  base: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', base)
    xhr.withCredentials = true
    xhr.timeout = UPLOAD_TIMEOUT_MS
    for (const [name, value] of Object.entries(csrfHeader())) xhr.setRequestHeader(name, value)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // A 2xx whose body will not parse must still settle this promise. Throwing here would
        // throw inside an event handler, off the executor's stack, where nothing catches it --
        // and the caller would await forever.
        try {
          resolve(JSON.parse(xhr.responseText) as ImageResponse)
        } catch {
          reject(new UploadError('NETWORK', xhr.status))
        }
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
    xhr.ontimeout = () => reject(new UploadError('NETWORK', 0))

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
