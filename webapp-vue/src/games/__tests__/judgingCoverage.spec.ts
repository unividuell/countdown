import { describe, expect, it } from 'vitest'
import { gameComponents } from '@/games/registry'

/** Every game's spec sources, by folder: `guesshue/__tests__/…` → `guesshue`. */
const specs = import.meta.glob<string>('../*/__tests__/*.spec.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function specSourcesOf(folder: string): string[] {
  return Object.entries(specs)
    .filter(([path]) => path.startsWith(`../${folder}/`))
    .map(([, source]) => source)
}

describe('every registered game checks that it judges with its verdict', () => {
  // The game id names its folder without the hyphen: `guess-hue` → `guesshue`.
  it.each(Object.keys(gameComponents))('%s', (id) => {
    const sources = specSourcesOf(id.replaceAll('-', ''))

    expect(sources.some((source) => source.includes('expectJudgesWithVerdict('))).toBe(true)
  })
})
