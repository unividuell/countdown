import { UploadError } from '@/api/upload'
import { toWav } from '@/audio/toWav'
import type { PcmSource } from '@/audio/toWav'
import { audioGraph } from '@/ui/audio'

/** Longer than this cannot become a WAV under the pool's byte limit anyway. */
export const MAX_SECONDS = 60

/**
 * Stand-in limit for a container that reports no usable duration (some WebM recordings say
 * `Infinity`): without a length there is only the size to go by.
 */
export const UNKNOWN_DURATION_MAX_BYTES = 2 * 1024 * 1024

/**
 * Some engines never fire either event for a file they have no mind to open, and the queue is
 * sequential: a probe that never settles would hold every file behind it.
 */
export const PROBE_TIMEOUT_MS = 10_000

/**
 * The duration the `<audio>` element reads from the file's metadata (`NaN` if it stays silent until
 * the timeout, `Infinity` for some containers), or `null` when the element reports the file
 * unplayable.
 */
export function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const timer = setTimeout(() => {
      settle(NaN)
      // Still loading, it would go on asking for a URL that no longer exists.
      audio.removeAttribute('src')
      audio.load()
    }, PROBE_TIMEOUT_MS)

    // Whichever comes first wins; the others are detached so the URL is revoked exactly once.
    function settle(duration: number | null): void {
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      URL.revokeObjectURL(url)
      resolve(duration)
    }

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => settle(audio.duration)
    audio.onerror = () => settle(null)
    audio.src = url
  })
}

function decodeWithGraph(data: ArrayBuffer): Promise<PcmSource> {
  const graph = audioGraph()
  if (graph === null) return Promise.reject(new Error('no audio graph'))
  return graph.decodeAudioData(data)
}

/**
 * Picked file to the WAV the server takes, or an `UploadError` the queue shows like a server
 * refusal — all before any request.
 *
 * The duration is checked before decoding: 25 MB of AAC is up to 50 minutes, which decoded to
 * Float32 is a gigabyte, enough to take a phone's tab down along with the rest of the queue.
 */
export async function prepareWav(
  file: File,
  maxBytes: number,
  deps: {
    probe?: (file: File) => Promise<number | null>
    decode?: (data: ArrayBuffer) => Promise<PcmSource>
  } = {},
): Promise<Blob> {
  const { probe = probeDuration, decode = decodeWithGraph } = deps

  const seconds = await probe(file)
  // The element itself says it cannot play this: decoding would only fail after reading it all.
  if (seconds === null) throw new UploadError('UNDECODABLE', 0)

  const tooLong = Number.isFinite(seconds)
    ? seconds > MAX_SECONDS
    : file.size > UNKNOWN_DURATION_MAX_BYTES
  if (tooLong) throw new UploadError('TOO_LONG', 0)

  let pcm: PcmSource
  try {
    pcm = await decode(await file.arrayBuffer())
  } catch {
    throw new UploadError('UNDECODABLE', 0)
  }

  const wav = toWav(pcm)
  if (wav.byteLength > maxBytes) throw new UploadError('TOO_LARGE', 0)

  return new Blob([wav], { type: 'audio/wav' })
}
