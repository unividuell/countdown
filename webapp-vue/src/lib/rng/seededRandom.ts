// Mirror of backend SeededRandom (Kotlin is the source of truth). Byte-identical streams are a
// contract verified against shared/rng/golden-vectors.json — see seededRandom.spec.ts.
//
// nextUint32 follows Blackman/Vigna's reference verbatim — https://prng.di.unimi.it/xoshiro128starstar.c
// — i.e. v1.1, whose scrambler reads s1. The superseded v1.0 reads s0 and yields a different stream.
//
// Only operations whose result is mandated bit-for-bit by both ECMAScript and the JVM are used:
// ToInt32/ToUint32 bit ops, Math.imul, and IEEE754 add/multiply/divide by powers of two.
// Math.sin/cos/log/exp/pow/atan/cbrt are implementation-approximated and DIVERGE between engines
// (measured: V8 vs JavaScriptCore differ by 1 ulp) — they must never enter this file.

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const GOLDEN_GAMMA_32 = 0x9e3779b9
const TWO_POW_32 = 0x100000000
const TWO_POW_26 = 67108864
const TWO_POW_53 = 9007199254740992

const utf8 = new TextEncoder()

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k)) | 0

/** FNV-1a over the UTF-8 bytes — NOT over UTF-16 code units, which would diverge for 'hütte'. */
function hashSeedString(seed: string): number {
  let h = FNV_OFFSET_BASIS | 0
  for (const byte of utf8.encode(seed)) {
    h ^= byte
    h = Math.imul(h, FNV_PRIME)
  }
  return h | 0
}

export class SeededRandom {
  private s0: number
  private s1: number
  private s2: number
  private s3: number

  private constructor(s0: number, s1: number, s2: number, s3: number) {
    this.s0 = s0
    this.s1 = s1
    this.s2 = s2
    this.s3 = s3
  }

  /** A string seed is hashed to 32 bits; a number seed is truncated to its low 32 bits. */
  static fromSeed(seed: number | string): SeededRandom {
    const seed32 = typeof seed === 'string' ? hashSeedString(seed) : seed | 0
    let a = seed32
    const state = new Int32Array(4)
    for (let i = 0; i < 4; i++) {
      a = (a + GOLDEN_GAMMA_32) | 0
      let t = a ^ (a >>> 16)
      t = Math.imul(t, 0x21f0aaad)
      t = t ^ (t >>> 15)
      t = Math.imul(t, 0x735a2d97)
      state[i] = t ^ (t >>> 15)
    }
    const [s0 = 0, s1 = 0, s2 = 0, s3 = 0] = state
    // xoshiro cannot escape the all-zero state; splitmix32 can only produce it for one seed.
    return (s0 | s1 | s2 | s3) === 0
      ? new SeededRandom(1, s1, s2, s3)
      : new SeededRandom(s0, s1, s2, s3)
  }

  /** xoshiro128** — the raw stream. Returns an unsigned 32-bit value as a safe integer. */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9)
    const t = (this.s1 << 9) | 0
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = rotl(this.s3, 11)
    return result >>> 0
  }

  /** Unbiased via rejection — plain `% span` would over-represent the low residues. */
  private nextBounded(span: number): number {
    const threshold = TWO_POW_32 % span
    let r = this.nextUint32()
    while (r < threshold) r = this.nextUint32()
    return r % span
  }

  nextInt(boundExclusive: number): number {
    if (!Number.isInteger(boundExclusive) || boundExclusive <= 0) {
      throw new RangeError(`bound must be a positive integer, was ${boundExclusive}`)
    }
    return this.nextBounded(boundExclusive)
  }

  nextIntBetween(min: number, maxInclusive: number): number {
    if (maxInclusive < min) {
      throw new RangeError(`max must not be below min, was ${min}..${maxInclusive}`)
    }
    return min + this.nextBounded(maxInclusive - min + 1)
  }

  /** 53 bits from two words, scaled by an exact power of two, so the value is bit-identical. */
  nextDouble(): number {
    const hi = this.nextUint32() >>> 5
    const lo = this.nextUint32() >>> 6
    return (hi * TWO_POW_26 + lo) / TWO_POW_53
  }

  /** The most significant bit. Switching to `& 1` would need the vectors regenerated on both sides. */
  nextBoolean(): boolean {
    return this.nextUint32() >>> 31 !== 0
  }

  // Fisher-Yates, descending, drawing nextInt(i + 1). Drawing nextInt(length) instead is genuinely
  // biased; running ascending is unbiased but yields a different permutation. Both mistakes
  // reproduce identically on the JVM, so no parity test catches them — the direction is pinned only
  // by the golden vectors.
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1)
      // Both indices are in bounds, so the reads cannot be undefined.
      const swapped = out[i] as T
      out[i] = out[j] as T
      out[j] = swapped
    }
    return out
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from an empty list')
    return items[this.nextInt(items.length)] as T
  }

  /** Weights are summed left to right so the JVM performs the identical sequence of additions. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new RangeError(`items and weights must be non-empty and equal in length`)
    }
    let total = 0
    for (const w of weights) {
      if (!(w >= 0)) throw new RangeError(`weights must be non-negative, was ${w}`)
      total += w
    }
    if (total <= 0) throw new RangeError('weights must not sum to zero')
    const target = this.nextDouble() * total
    let cumulative = 0
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i] as number
      if (target < cumulative) return items[i] as T
    }
    return items[items.length - 1] as T
  }

  /** Without replacement. Equivalent to taking the first k of a full shuffle. */
  sample<T>(items: readonly T[], k: number): T[] {
    if (k < 0 || k > items.length) {
      throw new RangeError(`k must be within 0..${items.length}, was ${k}`)
    }
    return this.shuffled(items).slice(0, k)
  }
}
