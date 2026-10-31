/**
 * Synthesised noise, so Peilung needs no downloaded recordings for wind, rain and birds. Every
 * buffer is mono and levelled to the same loudness (RMS) as a clip, so a knob's dB is the
 * signal-to-noise ratio the ear gets.
 */

/** Loudness every part is levelled to before the mix. */
export const REF_RMS = 0.1

/** A noise source answers a ping with about as much sound as a clip. */
export const BURST_SECONDS = 1.3

const LOOP_SECONDS = 6

/** Tail blended into the head, so a filtered loop has no click at the seam. */
const SEAM_SECONDS = 0.08
const FADE_SECONDS = 0.02

type Render = (n: number, rate: number) => Float32Array<ArrayBuffer>

const white = (): number => Math.random() * 2 - 1

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0

  let sum = 0
  for (const v of samples) sum += v * v

  return Math.sqrt(sum / samples.length)
}

/** A copy scaled to `REF_RMS`; silence stays silence. */
export function levelled(samples: Float32Array): Float32Array<ArrayBuffer> {
  const level = rms(samples)
  const scale = level > 0 ? REF_RMS / level : 1

  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = (samples[i] ?? 0) * scale

  return out
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

/** Renders [length + seam] samples, then folds the extra tail over the head with a crossfade. */
function seamless(rate: number, render: Render): Float32Array<ArrayBuffer> {
  const length = Math.round(LOOP_SECONDS * rate)
  const seam = Math.round(SEAM_SECONDS * rate)
  const raw = render(length + seam, rate)

  const out = raw.slice(0, length)
  for (let i = 0; i < seam; i++) {
    const w = i / seam
    out[i] = (raw[i] ?? 0) * w + (raw[length + i] ?? 0) * (1 - w)
  }

  return levelled(out)
}

/** Paul Kellet's pink filter: the soft, even hiss of a detuned radio. */
function pink(n: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n)
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0
  for (let i = 0; i < n; i++) {
    const w = white()
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }

  return out
}

/** Brown rumble under a slow swell. */
function wind(n: number, rate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n)
  const loop = LOOP_SECONDS * rate
  const p1 = Math.random() * 2 * Math.PI
  const p2 = Math.random() * 2 * Math.PI
  let brown = 0
  for (let i = 0; i < n; i++) {
    brown = (brown + 0.02 * white()) / 1.02
    const swell =
      0.55 +
      0.3 * Math.sin((2 * Math.PI * i) / loop + p1) +
      0.15 * Math.sin((6 * Math.PI * i) / loop + p2)
    out[i] = brown * swell
  }

  return out
}

/** High hiss plus droplets: short noise bursts, ~70 a second, each dying within milliseconds. */
function rain(n: number, rate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    const w = white()
    out[i] = (w - last) * 0.25
    last = w
  }

  const drops = Math.round((n / rate) * 70)
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(Math.random() * n)
    const amp = 0.3 + Math.random() * 0.9
    const tau = (0.002 + Math.random() * 0.004) * rate
    for (let j = 0; j < tau * 5 && at + j < n; j++) {
      out[at + j] = (out[at + j] ?? 0) + amp * white() * Math.exp(-j / tau)
    }
  }

  return out
}

/** Phrases of 2–6 sweeping chirps between 2 and 9 kHz, with quiet in between. */
function birds(n: number, rate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n)
  let t = 0

  while (t < n) {
    const chirps = 2 + Math.floor(Math.random() * 5)
    const f0 = 2500 + Math.random() * 3000
    for (let c = 0; c < chirps; c++) {
      const length = Math.round((0.04 + Math.random() * 0.07) * rate)
      const f1 = f0 * (0.6 + Math.random())
      let phase = 0
      for (let j = 0; j < length && t + j < n; j++) {
        const u = j / length
        phase += (2 * Math.PI * (f0 + (f1 - f0) * u)) / rate
        out[t + j] = (out[t + j] ?? 0) + Math.sin(phase) * Math.sin(Math.PI * u) ** 2
      }
      t += length + Math.round((0.03 + Math.random() * 0.09) * rate)
    }
    t += Math.round((0.5 + Math.random()) * rate)
  }

  return out
}

/** Short fades at both ends, so a burst neither clicks nor cuts. */
function faded(data: Float32Array<ArrayBuffer>, rate: number): Float32Array<ArrayBuffer> {
  const n = data.length
  const fade = Math.round(FADE_SECONDS * rate)
  for (let i = 0; i < fade && i < n; i++) {
    data[i] = (data[i] ?? 0) * (i / fade)
    data[n - 1 - i] = (data[n - 1 - i] ?? 0) * (i / fade)
  }

  return data
}

const SYNTHESISERS = { BIRDS: birds, WIND: wind, RAIN: rain } satisfies Record<string, Render>

/** Pink hiss that loops for good under everything. */
export function bedSamples(rate: number): Float32Array<ArrayBuffer> {
  return seamless(rate, pink)
}

/** One answer of a noise source: sound from the first sample, `BURST_SECONDS` long. */
export function burstSamples(
  kind: keyof typeof SYNTHESISERS,
  rate: number,
): Float32Array<ArrayBuffer> {
  const n = Math.round(BURST_SECONDS * rate)

  return levelled(faded(SYNTHESISERS[kind](n, rate), rate))
}
