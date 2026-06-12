export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** JSON-only API: callers pass an already-serialized string body. */
export type ApiFetchOptions = Omit<RequestInit, 'body'> & { body?: string | null }

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function readJsonBody(res: Response): Promise<unknown> {
  if (!res.headers.get('content-type')?.includes('application/json')) return undefined
  return res.json().catch(() => undefined)
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (MUTATING.has(method)) {
    const token = readCookie('XSRF-TOKEN')
    if (token) headers.set('X-XSRF-TOKEN', token)
  }
  if (options.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, { ...options, method, headers, credentials: 'include' })

  if (res.status === 401) {
    try {
      onUnauthorized()
    } catch {
      // never let a throwing handler mask the ApiError the caller expects
    }
    throw new ApiError(401, 'unauthorized', await readJsonBody(res))
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `request to ${path} failed: ${res.status}`,
      await readJsonBody(res),
    )
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type')
  if (!contentType?.includes('application/json')) {
    throw new ApiError(res.status, `unexpected content-type from ${path}: ${contentType ?? 'none'}`)
  }
  return (await res.json()) as T
}
