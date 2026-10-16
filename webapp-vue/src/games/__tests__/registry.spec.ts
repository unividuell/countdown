import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import type { AsyncComponentLoader } from 'vue'
import { asyncGame, gameComponents } from '@/games/registry'
import CopyBlocksGame from '@/games/copyblocks/CopyBlocksGame.vue'

// Mounting the async wrapper itself leaves test-utils without a root instance to read text from.
function mountGame(loader: AsyncComponentLoader) {
  const game = asyncGame(loader)

  return mount({ render: () => h(game) })
}

describe('registry', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers Blockierung to load on demand, keeping three.js out of other pages', () => {
    expect(gameComponents['copy-blocks']).toBeDefined()
    expect(gameComponents['copy-blocks']).not.toBe(CopyBlocksGame)
  })

  it('says so when the game fails to load, e.g. a tab left open across a deploy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountGame(() => Promise.reject(new Error('chunk 404')))

    await flushPromises()

    expect(wrapper.text()).toBe('Diese Runde lässt sich hier nicht anzeigen. Lade die Seite neu.')
  })

  it('says so while a slow game loads, but not at once', async () => {
    vi.useFakeTimers()
    const wrapper = mountGame(() => new Promise(() => {}))

    await vi.advanceTimersByTimeAsync(199)
    expect(wrapper.text()).toBe('')

    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.text()).toBe('Lädt …')
  })
})
