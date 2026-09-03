import { describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { labGameList } from '@/gamelab/games'

// A real `ref`, not a `{ value }` lookalike: the page reads the community in its TEMPLATE, where
// Vue unwraps refs returned from setup. A plain object skips that unwrapping and silently yields
// `undefined` — which is a defect in the double, not in the page.
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: ref({ slug: 'team', name: 'Team' }),
    refresh: vi.fn(),
  }),
}))

async function mountIndex() {
  const Page = (await import('@/pages/c/[slug]/lab/index.vue')).default
  return mount(Page, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('lab index', () => {
  it('lists every registered game', async () => {
    const w = await mountIndex()
    const list = w.get('[data-test="lab-game-list"]')
    for (const game of labGameList) {
      expect(list.text()).toContain(game.title)
      expect(w.find(`[data-test="lab-game-${game.id}"]`).exists()).toBe(true)
    }
    expect(w.findAllComponents(RouterLinkStub)).toHaveLength(labGameList.length)
  })

  it('links into the community in context', async () => {
    const w = await mountIndex()
    const links = w.findAllComponents(RouterLinkStub).map((l) => String(l.props().to))
    expect(links).toEqual(labGameList.map((g) => `/c/team/lab/${g.id}`))
  })

  it('links without a seed, so the game page rolls a fresh round each time', async () => {
    // The property that would break silently: pinning a seed here would make every visit from
    // the index replay the same round, and the index is exactly where you go to start a new one.
    const w = await mountIndex()
    for (const link of w.findAllComponents(RouterLinkStub)) {
      expect(String(link.props().to)).not.toContain('seed')
      expect(String(link.props().to)).not.toContain('?')
    }
  })

  it('names the community so a mistyped slug is obvious before you play', async () => {
    const w = await mountIndex()
    expect(w.text()).toContain('Team')
  })
})
