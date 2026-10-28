/** What `toWav` reads: the part of a decoded `AudioBuffer` it needs, so tests need no Web Audio. */
export type PcmSource = Pick<
  AudioBuffer,
  'numberOfChannels' | 'sampleRate' | 'length' | 'getChannelData'
>

const HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

/**
 * Float to 16 bit, scaled by the half of the range the sign points at: -1 is -32768, +1 is 32767.
 * A decoder can overshoot [-1, 1] and a broken one can emit NaN; neither may reach the Int16 write
 * as anything but a legal sample, or one bad frame costs the whole file.
 */
function toInt16(sample: number): number {
  if (Number.isNaN(sample)) return 0
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767)
}

function writeTag(view: DataView, at: number, tag: string): void {
  for (let i = 0; i < tag.length; i++) view.setUint8(at + i, tag.charCodeAt(i))
}

/**
 * Canonical 44-byte-header RIFF/WAVE, PCM, 16 bit little endian, channels and rate as decoded —
 * the one shape the server's intake accepts.
 *
 *   0  RIFF  size(36 + data)  WAVE
 *  12  fmt   16  format 1  channels  rate  byte rate  block align  16
 *  36  data  size(data)  interleaved samples: L R L R ...
 */
export function toWav(source: PcmSource): Uint8Array<ArrayBuffer> {
  const { numberOfChannels: channels, sampleRate, length: frames } = source
  const dataBytes = frames * channels * BYTES_PER_SAMPLE
  const wav = new Uint8Array(HEADER_BYTES + dataBytes)
  const view = new DataView(wav.buffer)

  writeTag(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeTag(view, 8, 'WAVE')
  writeTag(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * BYTES_PER_SAMPLE, true)
  view.setUint16(32, channels * BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  writeTag(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let channel = 0; channel < channels; channel++) {
    const samples = source.getChannelData(channel)
    for (let frame = 0; frame < frames; frame++) {
      const at = HEADER_BYTES + (frame * channels + channel) * BYTES_PER_SAMPLE
      view.setInt16(at, toInt16(samples[frame] ?? 0), true)
    }
  }

  return wav
}
