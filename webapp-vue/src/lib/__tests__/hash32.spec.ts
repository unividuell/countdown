import { describe, expect, it } from 'vitest'
import { hash32 } from '@/lib/hash32'

describe('hash32', () => {
  // FNV-1a-32 reference values, top bit masked off.
  it('matches FNV-1a-32 without its sign bit', () => {
    expect(hash32('')).toBe(0x811c9dc5 & 0x7fffffff)
    expect(hash32('a')).toBe(0xe40c292c & 0x7fffffff)
  })
})
