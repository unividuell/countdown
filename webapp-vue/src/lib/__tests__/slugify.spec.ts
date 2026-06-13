import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slugify'

describe('slugify (parity with backend Slugs.slugify)', () => {
  it.each([
    ['Hütte Hütte', 'huette-huette'],
    ['Café Crème', 'cafe-creme'],
    ['Süßes & Saures!', 'suesses-saures'],
    ['  multiple   spaces  ', 'multiple-spaces'],
    ['Team---A', 'team-a'],
  ])('slugify(%s) = %s', (input, expected) => expect(slugify(input)).toBe(expected))
})
