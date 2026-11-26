import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { ApiError } from '@/api/client'
import { listGames } from '@/api/games'
import type { GameEntry } from '@/api/types'
import { checkLabGate } from '@/gamelab/api'

// Off in the community, listed anyway: the lab tests games, not the community's mix.
const GAMES: GameEntry[] = [
  { id: 'paint-ratio', displayName: 'Anmaßung', weight: 'NORMAL' },
  { id: 'song-snippet', displayName: 'Anspielung', weight: 'OFF' },
]

const replace = vi.fn()
const currentQuery = reactive<Record<string, string>>({})

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({
    get query() {
      return currentQuery
    },
    get fullPath() {
      const query = new URLSearchParams(currentQuery).toString()
      return query ? `/c/team/lab?${query}` : '/c/team/lab'
    },
  }),
}))

function setQuery(next: Record<string, string>): void {
  for (const key of Object.keys(currentQuery)) delete currentQuery[key]
  Object.assign(currentQuery, next)
}

// A real `ref`, not a `{ value }` lookalike: the page reads the community in its TEMPLATE, where
// Vue unwraps refs returned from setup. A plain object skips that unwrapping and silently yields
// `undefined` — which is a defect in the double, not in the page.
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: ref({ slug: 'team', name: 'Team' }),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/gamelab/api', () => ({ checkLabGate: vi.fn() }))
vi.mock('@/api/games', () => ({ listGames: vi.fn() }))

/** The list's links, without the cross-link to the other lab beside the heading. */
const listLinks = (w: VueWrapper) =>
  w
    .findAllComponents(RouterLinkStub)
    .filter((l) => l.attributes('data-test') !== 'lab-other')
    .map((l) => String(l.props().to))

async function mountIndex() {
  const Page = (await import('@/pages/c/[slug]/lab/index.vue')).default
  const w = mount(Page, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return w
}

describe('lab index', () => {
  beforeEach(() => {
    replace.mockReset()
    setQuery({})
    vi.mocked(checkLabGate).mockReset().mockResolvedValue(undefined)
    vi.mocked(listGames).mockReset().mockResolvedValue(GAMES)
  })

  // Issue #99: the game pages were gated, the index was not.
  it('lists nothing where the lab is off', async () => {
    vi.mocked(checkLabGate).mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountIndex()
    expect(w.find('[data-test="lab-game-list"]').exists()).toBe(false)
    expect(w.get('[data-test="lab-unavailable"]').text()).toContain('Spiel-Labor nicht verfügbar')
    expect(listGames).not.toHaveBeenCalled()
  })

  it('lists every game the server has, off ones included', async () => {
    const w = await mountIndex()
    expect(listGames).toHaveBeenCalledWith('team')
    const list = w.get('[data-test="lab-game-list"]')
    for (const game of GAMES) {
      expect(list.text()).toContain(game.displayName)
      expect(w.find(`[data-test="lab-game-${game.id}"]`).exists()).toBe(true)
    }
    expect(list.findAllComponents(RouterLinkStub)).toHaveLength(GAMES.length)
  })

  it('says so when the server has no game', async () => {
    vi.mocked(listGames).mockResolvedValue([])
    const w = await mountIndex()
    expect(w.find('[data-test="lab-game-list"]').exists()).toBe(false)
    expect(w.find('[data-test="lab-no-games"]').exists()).toBe(true)
  })

  it('says so when the games fail to load', async () => {
    vi.mocked(listGames).mockRejectedValue(new ApiError(500, 'boom'))
    const w = await mountIndex()
    expect(w.find('[data-test="lab-game-list"]').exists()).toBe(false)
    expect(w.find('[data-test="lab-games-error"]').exists()).toBe(true)
  })

  it('links to the card lab beside its heading', async () => {
    const w = await mountIndex()
    const link = w.getComponent<typeof RouterLinkStub>('[data-test="lab-other"]')
    expect(link.props().to).toBe('/c/team/card-lab')
    expect(link.text()).toBe('Karten-Labor')
  })

  it('links into the community in context', async () => {
    const w = await mountIndex()
    const links = listLinks(w)
    expect(links).toEqual(GAMES.map((g) => `/c/team/lab/${g.id}`))
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

  it('carries phase two and the ramp into every link', async () => {
    setQuery({ phase: 'TWO', ramp: '1' })
    const w = await mountIndex()
    const links = listLinks(w)
    expect(links).toEqual(GAMES.map((g) => `/c/team/lab/${g.id}?phase=TWO&ramp=1`))
  })

  it('writes the chosen phase and ramp into its own URL', async () => {
    const w = await mountIndex()

    await w.get('[data-test="lab-phase-TWO"]').trigger('click')
    expect(replace).toHaveBeenLastCalledWith({ query: { phase: 'TWO' } })

    await w.get('[data-test="lab-ramp"]').setValue(true)
    expect(replace).toHaveBeenLastCalledWith({ query: { ramp: '1' } })
  })

  it('switches player back to the index, settings included', async () => {
    setQuery({ phase: 'TWO' })
    const w = await mountIndex()

    const href = w.get('[data-test="lab-switch-player"]').attributes('href')!
    expect(new URL(href, 'https://example.test').searchParams.get('redirect')).toBe(
      '/c/team/lab?phase=TWO',
    )
  })
})
