import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SongSnippetReveal from '@/games/songsnippet/SongSnippetReveal.vue'
import type { SongSnippetSolution } from '@/games/songsnippet/types'

const SOLUTION: SongSnippetSolution = {
  artist: 'Element of Crime',
  title: 'Delmenhorst',
  coverUrl: null,
  link: 'https://example.invalid/track/1',
}

/**
 * Both children bring their own audio and asset machinery and are tested where they live; this
 * spec is about the reveal's own root and nothing else.
 */
function mountReveal() {
  return mount(SongSnippetReveal, {
    props: { solution: SOLUTION, durations: [0.1, 0.5, 2, 8, 15], rows: [], live: false },
    global: { stubs: { SongPlayerReveal: true, SongSnippetScoreboard: true } },
  })
}

describe('SongSnippetReveal', () => {
  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page).
  it('brings no frame of its own', () => {
    const classes = mountReveal().classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('is reachable from the game adapter that mounts it', () => {
    expect(mountReveal().attributes('data-test')).toBe('song-reveal')
  })
})
