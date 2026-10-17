import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type AssetKey, loadSealed, openSealed, type RoundAssets } from '@/api/assets'

// How often the cipher is built: a warm-up leaves no trace but the work it does.
const chacha = vi.hoisted(() => ({ constructed: 0 }))

vi.mock('@noble/ciphers/chacha.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/ciphers/chacha.js')>()

  return {
    ...actual,
    chacha20poly1305: (...args: Parameters<typeof actual.chacha20poly1305>) => {
      chacha.constructed++
      return actual.chacha20poly1305(...args)
    },
  }
})

// The same file the JVM suite seals against: one side cannot drift without the other going red.
const VECTORS_PATH = '../shared/round-assets/seal-vectors.json'

interface Vector {
  keyHex: string
  nonceHex: string
  plaintextHex: string
  sealedHex: string
}

const { vectors } = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as { vectors: Vector[] }

// The 300-byte vector: long enough to span more than one ChaCha block.
const longVector = vectors[1]!

const hex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/../g) ?? [], (byte) => parseInt(byte, 16))

const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))

/** Same length, one ciphertext byte off: what a different key or a stale sealing looks like. */
const tamper = (bytes: Uint8Array): Uint8Array => {
  const copy = bytes.slice()
  copy[20] = copy[20]! ^ 1
  return copy
}

const keyOf = (v: Vector): AssetKey => ({ key: base64(hex(v.keyHex)), mediaType: 'audio/mpeg' })

const assetsFor = (v: Vector): RoundAssets => ({
  url: (name) => `/x/${name}`,
  key: (name) => (name === 'board' ? keyOf(v) : null),
})

const respond = (bytes: Uint8Array) => new Response(bytes as BodyInit)

describe('openSealed', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("opens every golden vector into a blob of the key's media type", async () => {
    for (const v of vectors) {
      const blob = openSealed(hex(v.sealedHex), {
        key: base64(hex(v.keyHex)),
        mediaType: 'application/x-test',
      })

      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(hex(v.plaintextHex))
      expect(blob.type).toBe('application/x-test')
    }
  })

  it('opens without crypto.subtle, as on a phone over LAN HTTP', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    expect(() => openSealed(hex(longVector.sealedHex), keyOf(longVector))).not.toThrow()
  })

  it('throws on bytes that do not belong to the key', () => {
    expect(() => openSealed(tamper(hex(longVector.sealedHex)), keyOf(longVector))).toThrow()
  })

  it('throws on bytes too short to hold a nonce and a tag', () => {
    expect(() => openSealed(new Uint8Array(10), keyOf(longVector))).toThrow()
  })
})

describe('loadSealed', () => {
  afterEach(() => vi.unstubAllGlobals())

  const foreign = (): Uint8Array => tamper(hex(longVector.sealedHex))

  it('fetches once more past the cache when the first bytes do not open', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(foreign()))
      .mockResolvedValueOnce(respond(hex(longVector.sealedHex)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadSealed(assetsFor(longVector), 'board')).resolves.toBeInstanceOf(Blob)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/x/board',
      expect.not.objectContaining({ cache: 'reload' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/x/board',
      expect.objectContaining({ cache: 'reload' }),
    )
  })

  it('gives up after the second miss', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => respond(foreign()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadSealed(assetsFor(longVector), 'board')).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a failed fetch, only a failed opening', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadSealed(assetsFor(longVector), 'board')).rejects.toThrow('404')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a name without a key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadSealed(assetsFor(longVector), 'photo')).rejects.toThrow('photo')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('warmUpOpening', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The module afresh, so its once-per-page state is not one a sibling test already used up. */
  const fresh = async () => {
    vi.resetModules()
    chacha.constructed = 0
    return import('@/api/assets')
  }

  it('warms the opening path once per page', async () => {
    const { warmUpOpening } = await fresh()

    warmUpOpening()
    const first = chacha.constructed
    warmUpOpening()

    expect(first).toBeGreaterThan(0)
    expect(chacha.constructed).toBe(first)
  })

  it('warms up without crypto.subtle, as on a phone over LAN HTTP', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const { warmUpOpening } = await fresh()

    expect(() => warmUpOpening()).not.toThrow()
    expect(chacha.constructed).toBeGreaterThan(0)
  })

  it('is not part of loading an asset: that opens once and nothing more', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(hex(longVector.sealedHex))))
    const { loadSealed: load } = await fresh()

    await load(assetsFor(longVector), 'board')

    expect(chacha.constructed).toBe(1)
  })
})
