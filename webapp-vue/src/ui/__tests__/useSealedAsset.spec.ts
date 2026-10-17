import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope, nextTick, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { type AssetKey, type RoundAssets, warmUpOpening } from '@/api/assets'
import type { SceneState } from '@/ui/sceneState'
import { useSealedAsset } from '@/ui/useSealedAsset'

// The warm-up is observed, not run: its own spec covers what it does.
vi.mock('@/api/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/assets')>()),
  warmUpOpening: vi.fn(),
}))

const { vectors } = JSON.parse(
  readFileSync('../shared/round-assets/seal-vectors.json', 'utf8'),
) as {
  vectors: { keyHex: string; sealedHex: string }[]
}

const hex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/../g) ?? [], (byte) => parseInt(byte, 16))

const vector = vectors[1]!
const sealed = (): Uint8Array => hex(vector.sealedHex)

/** Same length, one ciphertext byte off: what a stale sealing looks like to the current key. */
const foreign = (): Uint8Array => {
  const bytes = sealed()
  bytes[20] = bytes[20]! ^ 1
  return bytes
}
const rightKey: AssetKey = {
  key: btoa(String.fromCharCode(...hex(vector.keyHex))),
  mediaType: 'audio/mpeg',
}
const wrongKey: AssetKey = { key: btoa('x'.repeat(32)), mediaType: 'audio/mpeg' }

/** The keys the "server" has handed out so far — reactive, as the round response is. */
const keys = reactive<Record<string, AssetKey>>({})

const assets: RoundAssets = {
  url: (name) => `/x/${name}`,
  key: (name) => keys[name] ?? null,
}

describe('useSealedAsset', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const scopes: EffectScope[] = []

  beforeEach(() => {
    for (const k of Object.keys(keys)) delete keys[k]
    vi.mocked(warmUpOpening).mockReset()
    fetchMock = vi.fn().mockImplementation(async () => new Response(sealed() as BodyInit))
    vi.stubGlobal('fetch', fetchMock)

    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:asset-${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    // `keys` is shared: a scope left running would keep reacting to the next test's keys.
    scopes.splice(0).forEach((scope) => scope.stop())
    vi.unstubAllGlobals()
  })

  /** The composable owns a watcher and an object URL, so it runs in a scope the test can end. */
  function use(source: () => RoundAssets | undefined = () => assets) {
    const scope = effectScope()
    scopes.push(scope)
    const asset = scope.run(() => useSealedAsset(source, 'board'))!
    return { ...asset, scope }
  }

  it('is preparing until the sealed bytes arrive, then ready without a src', async () => {
    const { state, src } = use()

    expect(state.value).toBe('preparing')
    expect(src.value).toBeNull()

    await flushPromises()

    expect(state.value).toBe('ready')
    expect(src.value).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/x/board')
  })

  describe('warming up', () => {
    it('warms the opening path when sealed bytes arrive before their key', async () => {
      const { state } = use()

      await flushPromises()

      expect(warmUpOpening).toHaveBeenCalledTimes(1)
      expect(state.value).toBe('ready')
    })

    it('does not warm up when the key is already there', async () => {
      keys.board = rightKey
      const { src } = use()

      await flushPromises()

      expect(warmUpOpening).not.toHaveBeenCalled()
      expect(src.value).toBe('blob:asset-1')
    })

    it('warms up before the cover turns ready', async () => {
      let stateDuringWarmUp: SceneState | undefined
      const { state } = use()
      vi.mocked(warmUpOpening).mockImplementation(() => {
        stateDuringWarmUp = state.value
      })

      await flushPromises()

      expect(stateDuringWarmUp).toBe('preparing')
      expect(state.value).toBe('ready')
    })
  })

  it('stays preparing and fetches nothing while there is no url yet', async () => {
    const { state } = use(() => undefined)

    await flushPromises()

    expect(state.value).toBe('preparing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens into an object URL once the key arrives', async () => {
    const { state, src } = use()
    await flushPromises()

    keys.board = rightKey
    await flushPromises()

    expect(state.value).toBe('ready')
    expect(src.value).toBe('blob:asset-1')
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBe(300)
  })

  it('opens once for a key that arrives before the bytes', async () => {
    keys.board = rightKey
    const { src } = use()

    await flushPromises()

    expect(src.value).toBe('blob:asset-1')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('fails when the bytes cannot be fetched', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const { state, src } = use()

    await flushPromises()

    expect(state.value).toBe('failed')
    expect(src.value).toBeNull()
  })

  it('turns ready when a later key opens bytes an earlier one could not', async () => {
    const { state, src } = use()
    await flushPromises()
    keys.board = wrongKey
    await flushPromises()
    expect(state.value).toBe('failed')

    keys.board = rightKey
    await flushPromises()

    expect(state.value).toBe('ready')
    expect(src.value).toBe('blob:asset-1')
  })

  describe('retry', () => {
    it('fetches again after a failed fetch and turns ready', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
      const { state, src, retry } = use()
      await flushPromises()
      expect(state.value).toBe('failed')

      retry()

      expect(state.value).toBe('preparing')

      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/x/board')
      expect(state.value).toBe('ready')
      expect(src.value).toBeNull()
    })

    it('opens the fresh bytes when the key is already there', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
      keys.board = rightKey
      const { state, src, retry } = use()
      await flushPromises()
      expect(state.value).toBe('failed')

      retry()
      await flushPromises()

      expect(state.value).toBe('ready')
      expect(src.value).toBe('blob:asset-1')
    })

    it('starts over after bytes that would not open', async () => {
      const { state, src, retry } = use()
      await flushPromises()
      keys.board = wrongKey
      await flushPromises()
      expect(state.value).toBe('failed')
      expect(fetchMock).toHaveBeenCalledTimes(2)

      retry()

      expect(state.value).toBe('preparing')

      await flushPromises()

      // One plain fetch, then the single fresh one the open allows itself.
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(state.value).toBe('failed')
      expect(src.value).toBeNull()
    })

    it('lets the fetch it replaces go unheard', async () => {
      let arrive!: (r: Response) => void
      fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (arrive = resolve)))
      keys.board = rightKey
      const { state, src, retry } = use()

      retry()
      await flushPromises()
      expect(src.value).toBe('blob:asset-1')

      arrive(new Response(null, { status: 503 }))
      await flushPromises()

      expect(state.value).toBe('ready')
      expect(src.value).toBe('blob:asset-1')
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    })

    it('fetches nothing while there is no url', async () => {
      const { state, retry } = use(() => undefined)

      retry()
      await flushPromises()

      expect(state.value).toBe('preparing')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('does nothing once the scope has ended', async () => {
      const { scope, retry } = use()
      await flushPromises()

      scope.stop()
      retry()
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('fetches once more past the cache when the key does not open the cached bytes', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(foreign() as BodyInit))
      .mockResolvedValueOnce(new Response(sealed() as BodyInit))
    const { state, src } = use()
    await flushPromises()

    keys.board = rightKey
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ cache: 'reload' }))
    expect(state.value).toBe('ready')
    expect(src.value).toBe('blob:asset-1')
  })

  it('fails when even the fresh bytes do not open', async () => {
    const { state, src } = use()
    await flushPromises()

    keys.board = wrongKey
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('failed')
    expect(src.value).toBeNull()
  })

  it('does not open again when the same key is handed over anew', async () => {
    const { src } = use()
    await flushPromises()
    keys.board = rightKey
    await flushPromises()

    keys.board = { ...rightKey }
    await flushPromises()

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(src.value).toBe('blob:asset-1')
  })

  it('releases the previous object URL when it opens again', async () => {
    const { src } = use()
    await flushPromises()
    keys.board = rightKey
    await flushPromises()

    keys.board = { ...rightKey, mediaType: 'audio/wav' }
    await flushPromises()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:asset-1')
    expect(src.value).toBe('blob:asset-2')
  })

  it('releases the old object URL and starts over when the url changes', async () => {
    const other: RoundAssets = { url: (name) => `/y/${name}`, key: assets.key }
    const current = reactive({ assets: assets as RoundAssets })
    keys.board = rightKey
    const { state, src } = use(() => current.assets)
    await flushPromises()
    expect(src.value).toBe('blob:asset-1')

    current.assets = other
    await nextTick()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:asset-1')
    expect(src.value).toBeNull()
    expect(state.value).toBe('preparing')

    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/y/board', expect.anything())
    expect(src.value).toBe('blob:asset-2')
  })

  it('revokes its object URL when the scope ends', async () => {
    keys.board = rightKey
    const { src, scope } = use()
    await flushPromises()
    expect(src.value).toBe('blob:asset-1')

    scope.stop()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:asset-1')
  })

  it('ignores bytes of a url it has moved away from', async () => {
    let arrive!: (r: Response) => void
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (arrive = resolve)))
    const current = reactive({ assets: assets as RoundAssets })
    keys.board = rightKey
    const { src } = use(() => current.assets)

    current.assets = { url: (name) => `/y/${name}`, key: assets.key }
    await flushPromises()
    arrive(new Response(foreign() as BodyInit))
    await flushPromises()

    expect(src.value).toBe('blob:asset-1')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('creates nothing when the scope ends while the bytes are still on their way', async () => {
    let arrive!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (arrive = resolve)))
    keys.board = rightKey
    const { scope } = use()

    scope.stop()
    arrive(new Response(sealed() as BodyInit))
    await flushPromises()

    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  describe('when the scope ends during the second fetch', () => {
    const endDuringReload = async (reloaded: Uint8Array) => {
      let arrive!: (r: Response) => void
      fetchMock
        .mockResolvedValueOnce(new Response(foreign() as BodyInit))
        .mockReturnValueOnce(new Promise<Response>((resolve) => (arrive = resolve)))
      const asset = use()
      await flushPromises()
      keys.board = rightKey
      await flushPromises()

      asset.scope.stop()
      arrive(new Response(reloaded as BodyInit))
      await flushPromises()

      return asset
    }

    it('creates nothing from bytes that would have opened', async () => {
      await endDuringReload(sealed())

      expect(URL.createObjectURL).not.toHaveBeenCalled()
    })

    it('does not turn failed for bytes that would not have opened', async () => {
      const { state } = await endDuringReload(foreign())

      expect(state.value).toBe('ready')
    })
  })
})
