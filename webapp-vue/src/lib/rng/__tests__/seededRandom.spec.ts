import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SeededRandom } from '@/lib/rng/seededRandom'

// The same file the JVM suite asserts against (SeededRandomGoldenVectorTest). Reading the shared
// file rather than restating literals here is the point: one side cannot drift without the other
// side going red.
const VECTORS_PATH = '../shared/rng/golden-vectors.json'

type SeedKind = 'INT' | 'STRING'
interface SeedRef {
  seed: string
  seedKind: SeedKind
}
interface Vectors {
  algorithm: string
  version: number
  words: (SeedRef & { count: number; expected: number[] })[]
  nextInt: (SeedRef & { bound: number; count: number; expected: number[] })[]
  nextIntBetween: (SeedRef & { min: number; max: number; count: number; expected: number[] })[]
  nextDouble: (SeedRef & { count: number; expectedBits: string[] })[]
  nextBoolean: (SeedRef & { count: number; expected: string })[]
  shuffled: (SeedRef & { size: number; expected: number[] })[]
  weightedPick: (SeedRef & { weights: number[]; count: number; expected: number[] })[]
  sample: (SeedRef & { size: number; k: number; expected: number[] })[]
  streamChecksum: (SeedRef & { draws: number; modulus: number; expected: number })[]
}

const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as Vectors

const randomFor = (ref: SeedRef): SeededRandom =>
  ref.seedKind === 'INT' ? SeededRandom.fromSeed(Number(ref.seed)) : SeededRandom.fromSeed(ref.seed)

// Endianness is passed explicitly: a multi-byte TypedArray view would use the agent's
// implementation-defined byte order, whereas DataView with an explicit flag is portable.
const view = new DataView(new ArrayBuffer(8))
const bitsHex = (value: number): string => {
  view.setFloat64(0, value, false)
  return view.getBigUint64(0, false).toString(16)
}

const label = (ref: SeedRef): string =>
  `${ref.seedKind.toLowerCase()} seed ${JSON.stringify(ref.seed)}`

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

describe('SeededRandom (byte-identical to the JVM implementation)', () => {
  it('reads the golden vectors produced by the JVM', () => {
    expect(vectors.algorithm).toBe('xoshiro128** / splitmix32-expanded seed / FNV-1a-32 over UTF-8')
    expect(vectors.version).toBe(1)
    expect(vectors.words.length).toBeGreaterThan(0)
  })

  it.each(vectors.words.map((c) => [label(c), c] as const))('raw stream matches for %s', (_, c) => {
    const random = randomFor(c)
    expect(range(c.count).map(() => random.nextUint32())).toEqual(c.expected)
  })

  it.each(vectors.nextInt.map((c) => [`bound ${c.bound}`, c] as const))(
    'nextInt matches for %s',
    (_, c) => {
      const random = randomFor(c)
      expect(range(c.count).map(() => random.nextInt(c.bound))).toEqual(c.expected)
    },
  )

  it.each(vectors.nextIntBetween.map((c) => [`${c.min}..${c.max}`, c] as const))(
    'nextIntBetween matches for %s',
    (_, c) => {
      const random = randomFor(c)
      expect(range(c.count).map(() => random.nextIntBetween(c.min, c.max))).toEqual(c.expected)
    },
  )

  it.each(vectors.nextDouble.map((c) => [label(c), c] as const))(
    'nextDouble matches bit-for-bit for %s',
    (_, c) => {
      const random = randomFor(c)
      expect(range(c.count).map(() => bitsHex(random.nextDouble()))).toEqual(c.expectedBits)
    },
  )

  it.each(vectors.nextBoolean.map((c) => [label(c), c] as const))(
    'nextBoolean matches for %s',
    (_, c) => {
      const random = randomFor(c)
      const bits = range(c.count)
        .map(() => (random.nextBoolean() ? '1' : '0'))
        .join('')
      expect(bits).toBe(c.expected)
    },
  )

  it.each(vectors.shuffled.map((c) => [`size ${c.size}`, c] as const))(
    'shuffled matches for %s',
    (_, c) => {
      const random = randomFor(c)
      expect(random.shuffled(range(c.size))).toEqual(c.expected)
    },
  )

  it.each(vectors.weightedPick.map((c) => [JSON.stringify(c.weights), c] as const))(
    'weightedPick matches for weights %s',
    (_, c) => {
      const random = randomFor(c)
      const items = range(c.weights.length)
      expect(range(c.count).map(() => random.weightedPick(items, c.weights))).toEqual(c.expected)
    },
  )

  it.each(vectors.sample.map((c) => [`${c.k} of ${c.size}`, c] as const))(
    'sample matches for %s',
    (_, c) => {
      const random = randomFor(c)
      expect(random.sample(range(c.size), c.k)).toEqual(c.expected)
    },
  )

  it.each(vectors.streamChecksum.map((c) => [label(c), c] as const))(
    'the %s stream still matches after a million draws',
    (_, c) => {
      const random = randomFor(c)
      let sum = 0
      for (let i = 0; i < c.draws; i++) sum = (sum + random.nextUint32()) % c.modulus
      expect(sum).toBe(c.expected)
    },
  )
})

describe('SeededRandom behaviour', () => {
  it('replays the identical stream for the same seed and diverges for another', () => {
    const draw = (seed: number, count: number): number[] => {
      const random = SeededRandom.fromSeed(seed)
      return range(count).map(() => random.nextUint32())
    }

    expect(draw(2026, 64)).toEqual(draw(2026, 64))
    expect(draw(2026, 64)).not.toEqual(draw(2027, 64))
  })

  it('keeps raw words inside the unsigned 32-bit range', () => {
    const random = SeededRandom.fromSeed('range-probe')
    for (let i = 0; i < 100_000; i++) {
      const word = random.nextUint32()
      expect(Number.isInteger(word)).toBe(true)
      expect(word).toBeGreaterThanOrEqual(0)
      expect(word).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('hashes string seeds over UTF-8 bytes, not UTF-16 code units', () => {
    // Hashing charCodeAt values would give a different stream than the JVM for any non-ASCII seed;
    // 'hütte' is 6 UTF-8 bytes but 5 UTF-16 code units.
    const utf16Hash = ((s: string) => {
      let h = 0x811c9dc5 | 0
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
      }
      return h | 0
    })('hütte')

    const fromString = SeededRandom.fromSeed('hütte')
    const fromUtf16Hash = SeededRandom.fromSeed(utf16Hash)

    expect(range(8).map(() => fromString.nextUint32())).not.toEqual(
      range(8).map(() => fromUtf16Hash.nextUint32()),
    )
  })

  it('draws unbiased integers across the whole bound', () => {
    const random = SeededRandom.fromSeed(4711)
    const bound = 7
    const draws = 700_000
    const counts = new Array<number>(bound).fill(0)
    for (let i = 0; i < draws; i++) {
      const drawn = random.nextInt(bound)
      counts[drawn] = (counts[drawn] ?? 0) + 1
    }

    const expected = draws / bound
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.98)
      expect(count).toBeLessThan(expected * 1.02)
    }
  })

  it('rejects invalid arguments', () => {
    const random = SeededRandom.fromSeed(1)
    expect(() => random.nextInt(0)).toThrow(RangeError)
    expect(() => random.nextInt(-3)).toThrow(RangeError)
    expect(() => random.nextIntBetween(5, 4)).toThrow(RangeError)
    expect(() => random.pick([])).toThrow(RangeError)
    expect(() => random.sample([1, 2], 3)).toThrow(RangeError)
    expect(() => random.weightedPick([1, 2], [1])).toThrow(RangeError)
    expect(() => random.weightedPick([1, 2], [0, 0])).toThrow(RangeError)
  })

  it('shuffles uniformly over all permutations', () => {
    // Cross-runtime equality cannot catch this class of bug: a biased shuffle (drawing
    // nextInt(size) instead of nextInt(i + 1)) reproduces perfectly on both platforms and would
    // pass every parity test. Only a distributional check sees it.
    const random = SeededRandom.fromSeed('permutation-uniformity')
    const rounds = 240_000
    const counts = new Map<string, number>()
    for (let i = 0; i < rounds; i++) {
      const key = random.shuffled([0, 1, 2, 3]).join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    expect(counts.size).toBe(24)
    const expected = rounds / 24
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.9)
      expect(count).toBeLessThan(expected * 1.1)
    }
  })

  it('does not mutate the input when shuffling or sampling', () => {
    const deck = range(52)
    const random = SeededRandom.fromSeed('deck')
    const shuffled = random.shuffled(deck)

    expect(deck).toEqual(range(52))
    expect([...shuffled].sort((x, y) => x - y)).toEqual(range(52))
    expect(shuffled).not.toEqual(deck)
  })
})
