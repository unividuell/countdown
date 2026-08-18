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

/**
 * A hung request (as opposed to a failed one) never resolves on its own — nothing else in
 * `apiFetch` bounds it. 10s is a common client-side default (long enough to tolerate normal
 * latency plus a cold single-instance backend, short enough that a stuck navigation guard or
 * `bootstrap()` resolves in a UX-relevant time rather than leaving the app frozen indefinitely).
 */
const REQUEST_TIMEOUT_MS = 10_000

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

// `application/problem+json` is what the backend answers every 4xx with, and it is JSON — the
// RFC 6839 `+json` suffix says so. Matching `application/json` alone would throw away the only
// body that carries the server's own explanation.
const JSON_CONTENT_TYPE = /^application\/(.+\+)?json\b/

async function readJsonBody(res: Response): Promise<unknown> {
  if (!JSON_CONTENT_TYPE.test(res.headers.get('content-type') ?? '')) return undefined
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

  // AbortSignal.timeout/AbortSignal.any: Baseline widely available (Chrome 116+, Firefox 124+,
  // Safari 17.4+ for `.any`; all evergreen). This project targets no older browsers (ESNext
  // build target, no browserslist restricting legacy engines), so both are safe to rely on.
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal

  let res: Response
  try {
    res = await fetch(path, { ...options, method, headers, credentials: 'include', signal })
  } catch (err) {
    // A caller-initiated abort takes priority: report it as-is (typically a DOMException
    // 'AbortError') rather than telling the caller the server was slow to respond.
    if (options.signal?.aborted) throw err
    if (timeoutSignal.aborted) {
      // status 0: no HTTP response was ever received, mirroring the browser's own convention
      // for network-level failures (e.g. XMLHttpRequest.status). A real status like 504 would
      // wrongly imply some server actually responded.
      throw new ApiError(0, `request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }
    throw err
  }

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
