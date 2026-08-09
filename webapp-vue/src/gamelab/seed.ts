/**
 * The lab's round identity. It is a signed 32-bit integer because that is what the backend's
 * `SeededRandom.fromSeed(Int)` takes — and because the RNG spec requires seeds to survive JSON as
 * plain numbers. Never send the string form: `fromSeed(7)` and `fromSeed("7")` are different
 * streams, so a string seed would quietly produce a different round.
 */
export const SEED_MIN = -2_147_483_648
export const SEED_MAX = 2_147_483_647

/**
 * The round a game opens on when the URL carries no usable seed: FNV-1a-32 over the UTF-8 bytes of
 * the game id, so every device and tab lands on the same first round without anyone having to pass
 * a number around. Hashing bytes rather than UTF-16 code units follows the same convention as the
 * rest of the codebase — a game id is free to carry an umlaut.
 *
 * Masked to 31 bits for exactly the reason `rollSeed` is non-negative, and more so: this is the
 * seed testers land on and quote most often, so it must not start with a minus.
 */
export function initialSeed(gameId: string): number {
  let hash = 0x811c9dc5 | 0
  for (const byte of new TextEncoder().encode(gameId)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash & SEED_MAX
}

export function parseSeed(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < SEED_MIN || value > SEED_MAX) return null
  return value
}

/**
 * Non-negative on purpose: the seed is meant to be read out loud, typed into another window and
 * pasted into a chat message, and a leading minus makes all three worse. `parseSeed` still accepts
 * the full int32 range, so a hand-typed negative seed works.
 */
export function rollSeed(): number {
  return Math.floor(Math.random() * (SEED_MAX + 1))
}
