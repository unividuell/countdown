import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UploadError } from '@/api/upload'
import {
  PROBE_TIMEOUT_MS,
  prepareWav,
  probeDuration,
  UNKNOWN_DURATION_MAX_BYTES,
} from '@/audio/intake'
import type { PcmSource } from '@/audio/toWav'

function pcm(frames: number, channels = 1): PcmSource {
  return {
    numberOfChannels: channels,
    sampleRate: 48000,
    length: frames,
    getChannelData: () => new Float32Array(frames),
  }
}

function fileOf(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'memo.m4a')
}

const FIVE_MB = 5 * 1024 * 1024

async function failureOf(attempt: Promise<unknown>): Promise<UploadError> {
  const error: unknown = await attempt.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(UploadError)
  return error as UploadError
}

describe('prepareWav', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a file longer than a minute without decoding it', async () => {
    const decode = vi.fn()

    const error = await failureOf(
      prepareWav(fileOf(1024), FIVE_MB, { probe: async () => 61, decode }),
    )

    expect(error).toMatchObject({ code: 'TOO_LONG', status: 0 })
    expect(decode).not.toHaveBeenCalled()
  })

  it('lets exactly a minute through', async () => {
    const decode = vi.fn(async () => pcm(10))

    await prepareWav(fileOf(1024), FIVE_MB, { probe: async () => 60, decode })

    expect(decode).toHaveBeenCalledOnce()
  })

  it('an unknown duration only lets small files through', async () => {
    const decode = vi.fn(async () => pcm(10))

    const error = await failureOf(
      prepareWav(fileOf(3 * 1024 * 1024), FIVE_MB, { probe: async () => Infinity, decode }),
    )
    expect(error).toMatchObject({ code: 'TOO_LONG', status: 0 })
    expect(decode).not.toHaveBeenCalled()

    await prepareWav(fileOf(1024), FIVE_MB, { probe: async () => NaN, decode })
    expect(decode).toHaveBeenCalledOnce()
  })

  it('a file the element cannot open is UNDECODABLE, whatever its size, without decoding', async () => {
    const decode = vi.fn()

    const error = await failureOf(
      prepareWav(fileOf(3 * 1024 * 1024), FIVE_MB, { probe: async () => null, decode }),
    )

    expect(error).toMatchObject({ code: 'UNDECODABLE', status: 0 })
    expect(decode).not.toHaveBeenCalled()
  })

  it('treats exactly the unknown-duration limit as small enough', async () => {
    const decode = vi.fn(async () => pcm(10))

    await prepareWav(fileOf(UNKNOWN_DURATION_MAX_BYTES), FIVE_MB, {
      probe: async () => NaN,
      decode,
    })

    expect(decode).toHaveBeenCalledOnce()
  })

  it('a file the browser cannot decode fails as UNDECODABLE', async () => {
    const decode = vi.fn(async () => {
      throw new DOMException('Unable to decode audio data', 'EncodingError')
    })

    const error = await failureOf(
      prepareWav(fileOf(1024), FIVE_MB, { probe: async () => 3, decode }),
    )

    expect(error).toMatchObject({ code: 'UNDECODABLE', status: 0 })
  })

  it('without an audio graph the file is UNDECODABLE', async () => {
    vi.stubGlobal('AudioContext', undefined)

    const error = await failureOf(prepareWav(fileOf(1024), FIVE_MB, { probe: async () => 3 }))

    expect(error).toMatchObject({ code: 'UNDECODABLE', status: 0 })
  })

  it('decodes through the shared graph by default', async () => {
    vi.resetModules()
    const decodeAudioData = vi.fn(async () => pcm(4))
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = decodeAudioData
      },
    )
    const intake = await import('@/audio/intake')

    const wav = await intake.prepareWav(fileOf(1024), FIVE_MB, { probe: async () => 3 })

    expect(decodeAudioData).toHaveBeenCalledOnce()
    expect(wav.size).toBe(44 + 4 * 2)
  })

  it('a WAV over the pool’s limit fails as TOO_LARGE', async () => {
    // 1 000 mono frames are 2 044 bytes as WAV.
    const error = await failureOf(
      prepareWav(fileOf(1024), 2000, { probe: async () => 3, decode: async () => pcm(1000) }),
    )

    expect(error).toMatchObject({ code: 'TOO_LARGE', status: 0 })
  })

  it('accepts a WAV of exactly the pool’s limit', async () => {
    const blob = await prepareWav(fileOf(1024), 2044, {
      probe: async () => 3,
      decode: async () => pcm(1000),
    })

    expect(blob.size).toBe(2044)
  })

  it('returns an audio/wav blob of header plus samples', async () => {
    const blob = await prepareWav(fileOf(1024), FIVE_MB, {
      probe: async () => 3,
      decode: async () => pcm(100, 2),
    })

    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 100 * 2 * 2)
  })
})

describe('probeDuration', () => {
  /** What the probe touches of an `<audio>` element; the real one would hit the network layer. */
  class FakeAudio {
    static last: FakeAudio

    preload = ''
    src = ''
    duration = NaN
    onloadedmetadata: (() => void) | null = null
    onerror: (() => void) | null = null
    removeAttribute = vi.fn()
    load = vi.fn()

    constructor() {
      FakeAudio.last = this
    }
  }

  let revoke: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Audio', FakeAudio)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:probe')
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads the duration from the file’s metadata', async () => {
    const probe = probeDuration(fileOf(1024))
    expect(FakeAudio.last.src).toBe('blob:probe')

    FakeAudio.last.duration = 3.5
    FakeAudio.last.onloadedmetadata?.()

    await expect(probe).resolves.toBe(3.5)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:probe')

    // the timer is gone with the settled probe
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('passes on whatever the element reports, Infinity included', async () => {
    const probe = probeDuration(fileOf(1024))

    FakeAudio.last.duration = Infinity
    FakeAudio.last.onloadedmetadata?.()

    await expect(probe).resolves.toBe(Infinity)
  })

  it('answers null when the element reports an error', async () => {
    const probe = probeDuration(fileOf(1024))

    FakeAudio.last.onerror?.()

    await expect(probe).resolves.toBeNull()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:probe')

    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('answers NaN when neither event comes, and lets go of the revoked URL', async () => {
    const probe = probeDuration(fileOf(1024))
    const audio = FakeAudio.last

    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1)
    expect(revoke).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(probe).resolves.toBeNaN()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:probe')
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(audio.load).toHaveBeenCalledOnce()

    // a late event finds nobody listening
    audio.onerror?.()
    audio.onloadedmetadata?.()
    expect(revoke).toHaveBeenCalledOnce()
  })
})
