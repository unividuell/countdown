/**
 * The lab's round identity. It is a signed 32-bit integer because that is what the backend's
 * `SeededRandom.fromSeed(Int)` takes — and because the RNG spec requires seeds to survive JSON as
 * plain numbers. Never send the string form: `fromSeed(7)` and `fromSeed("7")` are different
 * streams, so a string seed would quietly produce a different round.
 */
export const SEED_MIN = -2_147_483_648
export const SEED_MAX = 2_147_483_647

/**
 * FNV-1a-32 over the UTF-8 bytes of [text], masked to 31 bits so the result is never negative.
 *
 * Hashing bytes rather than UTF-16 code units follows the same convention as the rest of the
 * codebase — the strings fed to it are free to carry an umlaut. Lab-only, and only ever for values
 * a tester is allowed to see: a round's *content* is derived on the server from a seed it never
 * ships, and nothing here may become a convenient way around that.
 */
export function hash32(text: string): number {
  let hash = 0x811c9dc5 | 0
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash & SEED_MAX
}

/**
 * The round a game opens on when the URL carries no usable seed — hashed from the game id, so every
 * device and tab lands on the same first round without anyone having to pass a number around.
 *
 * Non-negative for exactly the reason `rollSeed` is, and more so: this is the seed testers land on
 * and quote most often, so it must not start with a minus.
 */
export function initialSeed(gameId: string): number {
  return hash32(gameId)
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
