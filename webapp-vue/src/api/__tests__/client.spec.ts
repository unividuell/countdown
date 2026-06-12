import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, setUnauthorizedHandler } from '@/api/client'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const hasJsonBody = body !== undefined
  const res = new Response(hasJsonBody ? JSON.stringify(body) : null, {
    status,
    headers: hasJsonBody ? { 'content-type': 'application/json', ...headers } : headers,
  })
  const spy = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('apiFetch', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=tok123'
    setUnauthorizedHandler(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GET sends credentials and parses JSON, no CSRF header', async () => {
    const spy = mockFetch(200, { id: '1' })
    const out = await apiFetch<{ id: string }>('/api/me')
    expect(out).toEqual({ id: '1' })
    const init = spy.mock.calls[0]![1]
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('mutating request sends X-XSRF-TOKEN from cookie and returns undefined on 204', async () => {
    const spy = mockFetch(204, undefined)
    const out = await apiFetch<void>('/logout', { method: 'POST' })
    expect(out).toBeUndefined()
    const init = spy.mock.calls[0]![1]
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('tok123')
    expect(init.credentials).toBe('include')
  })

  it('decodes a percent-encoded XSRF token', async () => {
    document.cookie = 'XSRF-TOKEN=tok%3D%3D'
    const spy = mockFetch(204, undefined)
    await apiFetch<void>('/logout', { method: 'POST' })
    const init = spy.mock.calls[0]![1]
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('tok==')
  })

  it('401 invokes the unauthorized handler and throws ApiError', async () => {
    mockFetch(401, { error: 'unauthorized' })
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    await expect(apiFetch('/api/me')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('still throws ApiError even if the unauthorized handler throws', async () => {
    mockFetch(401, { error: 'unauthorized' })
    setUnauthorizedHandler(() => {
      throw new Error('handler boom')
    })
    await expect(apiFetch('/api/me')).rejects.toBeInstanceOf(ApiError)
  })

  it('non-2xx throws ApiError with status and parsed body', async () => {
    mockFetch(500, { error: 'boom' })
    await expect(apiFetch('/api/me')).rejects.toMatchObject({
      status: 500,
      body: { error: 'boom' },
    })
  })

  it('throws on a non-JSON 200 response', async () => {
    mockFetch(200, undefined, { 'content-type': 'text/html' })
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 200 })
  })
})
