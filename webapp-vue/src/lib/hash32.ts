/**
 * FNV-1a-32 over the UTF-8 bytes of [text], masked to 31 bits so the result is never negative.
 *
 * Hashing bytes rather than UTF-16 code units follows the same convention as the rest of the
 * codebase — the strings fed to it are free to carry an umlaut. Only ever for picks that are
 * presentational and public (the lab's rounds, the closing poster): a round's *content* is derived
 * on the server from a seed it never ships, and nothing here may become a convenient way around
 * that.
 */
export function hash32(text: string): number {
  let hash = 0x811c9dc5 | 0
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash & 0x7fffffff
}
