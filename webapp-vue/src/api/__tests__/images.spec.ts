import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setUnauthorizedHandler } from '@/api/client'
import { UploadError, uploadImage } from '@/api/images'

/** happy-dom has no usable XMLHttpRequest, so the test drives one it owns. */
class FakeXhr {
  static last: FakeXhr
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  timeout = 0
  status = 0
  responseText = ''
  withCredentials = false
  headers: Record<string, string> = {}
  opened: [string, string] | null = null
  sent: unknown = null

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.opened = [method, url]
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.sent = body
  }
  abort() {}
}

describe('uploadImage', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    document.cookie = 'XSRF-TOKEN=tok123'
  })
  afterEach(() => vi.unstubAllGlobals())

  const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })

  it('posts multipart with the CSRF header and reports progress', async () => {
    const seen: number[] = []
    const promise = uploadImage('/api/communities/alpha/images', file, (f) => seen.push(f))

    const xhr = FakeXhr.last
    expect(xhr.opened).toEqual(['POST', '/api/communities/alpha/images'])
    expect(xhr.headers['X-XSRF-TOKEN']).toBe('tok123')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.sent).toBeInstanceOf(FormData)

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 } as ProgressEvent)
    xhr.status = 200
    xhr.responseText = JSON.stringify({
      id: 'x',
      width: 4,
      height: 3,
      byteSize: 9,
      createdAt: 'now',
      uploadedBy: 'alice',
    })
    xhr.onload?.()

    await expect(promise).resolves.toMatchObject({ id: 'x', uploadedBy: 'alice' })
    expect(seen).toEqual([0.25])
  })

  it('turns the problem+json code into an UploadError', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    const xhr = FakeXhr.last
    xhr.status = 409
    xhr.responseText = JSON.stringify({
      status: 409,
      detail: 'Pool holds at most 150 images',
      code: 'POOL_FULL',
    })
    xhr.onload?.()

    await expect(promise).rejects.toBeInstanceOf(UploadError)
    await promise.catch((e: UploadError) => expect(e.code).toBe('POOL_FULL'))
  })

  it('reports a network failure as an UploadError without a code', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    FakeXhr.last.onerror?.()
    await promise.catch((e: UploadError) => expect(e.code).toBe('NETWORK'))
  })

  it('falls back to NETWORK when a refusal body cannot be parsed as JSON', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    const xhr = FakeXhr.last
    xhr.status = 502
    xhr.responseText = '<html>gateway down</html>'
    xhr.onload?.()
    await promise.catch((e: UploadError) => expect(e.code).toBe('NETWORK'))
  })

  /** The three things this sidecar reproduces by hand are credentials, CSRF -- and this. */
  it('lets the app know when the session is gone', async () => {
    const seen = vi.fn()
    setUnauthorizedHandler(seen)
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    const xhr = FakeXhr.last
    xhr.status = 401
    xhr.responseText = JSON.stringify({ status: 401, code: 'NO_ACCESS' })
    xhr.onload?.()

    await promise.catch(() => {})
    expect(seen).toHaveBeenCalledOnce()
  })

  /** A 2xx that will not parse must still settle -- a throw inside onload settles nothing. */
  it('rejects rather than hangs when a success body is not JSON', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    const xhr = FakeXhr.last
    xhr.status = 201
    xhr.responseText = '<html>gateway</html>'
    xhr.onload?.()

    await expect(promise).rejects.toBeInstanceOf(UploadError)
  })

  it('gives up on a stalled upload instead of blocking the queue', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    FakeXhr.last.ontimeout?.()
    await promise.catch((e: UploadError) => expect(e.code).toBe('NETWORK'))
  })
})
