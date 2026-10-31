import { describe, expect, it } from 'vitest'

import { toWav } from '@/audio/toWav'
import type { PcmSource } from '@/audio/toWav'

// happy-dom has no AudioBuffer: a source is just its channels.
function pcm(sampleRate: number, ...channels: number[][]): PcmSource {
  const data = channels.map((c) => Float32Array.from(c))
  return {
    numberOfChannels: data.length,
    sampleRate,
    length: data[0]?.length ?? 0,
    getChannelData: (channel) => data[channel] ?? new Float32Array(0),
  }
}

function samples(wav: Uint8Array): number[] {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const out: number[] = []
  for (let at = 44; at < wav.byteLength; at += 2) out.push(view.getInt16(at, true))
  return out
}

function tag(view: DataView, at: number): string {
  return String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)))
}

describe('toWav', () => {
  it('writes a 44-byte canonical header', () => {
    const wav = toWav(pcm(48000, [0, 0, 0]))
    const view = new DataView(wav.buffer)

    expect(wav.byteLength).toBe(50)
    expect(tag(view, 0)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 6)
    expect(tag(view, 8)).toBe('WAVE')
    expect(tag(view, 12)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint32(28, true)).toBe(48000 * 1 * 2)
    expect(view.getUint16(32, true)).toBe(1 * 2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(tag(view, 36)).toBe('data')
    expect(view.getUint32(40, true)).toBe(6)
  })

  it('describes stereo in the header', () => {
    const view = new DataView(toWav(pcm(44100, [0, 0], [0, 0])).buffer)

    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2)
    expect(view.getUint16(32, true)).toBe(4)
    expect(view.getUint32(40, true)).toBe(8)
  })

  it('interleaves stereo frames', () => {
    const wav = toWav(pcm(48000, [0.5, -0.5], [1, -1]))

    expect(samples(wav)).toEqual([16384, 32767, -16384, -32768])
  })

  it('clamps and rounds to 16 bit', () => {
    const wav = toWav(pcm(48000, [1.5, -2, 0.25]))

    expect(samples(wav)).toEqual([32767, -32768, 8192])
  })

  it('never throws on samples that are not finite', () => {
    const wav = toWav(pcm(48000, [NaN, Infinity, -Infinity]))

    expect(samples(wav)).toEqual([0, 32767, -32768])
  })
})
