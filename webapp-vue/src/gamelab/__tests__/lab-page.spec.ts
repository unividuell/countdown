import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/api/client'
import * as api from '@/gamelab/api'
import type { LabRoundResponse, SamplePayload } from '@/gamelab/types'

const replace = vi.fn()
let currentQuery: Record<string, unknown> = { seed: '42' }
let currentParams: Record<string, string> = { slug: 'team', game: 'sample' }

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({
    get query() {
      return currentQuery
    },
    get params() {
      return currentParams
    },
    path: '/c/team/lab/sample',
  }),
}))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team' } },
    refresh: vi.fn(),
  }),
}))

const round: LabRoundResponse<SamplePayload> = {
  seed: 42,
  game: 'sample',
  displayName: 'Zahlenraten (Attrappe)',
  payload: { lowerBound: 100, upperBound: 199 },
  me: null,
  others: [],
  tookOverRound: false,
}

async function mountPage() {
  const Page = (await import('@/pages/c/[slug]/lab/[game].vue')).default
  const wrapper = mount(Page)
  await flushPromises()
  return wrapper
}

describe('lab page', () => {
  beforeEach(() => {
    replace.mockReset()
    currentQuery = { seed: '42' }
    currentParams = { slug: 'team', game: 'sample' }
    // vi.spyOn reuses the same mock across tests once a method is already spied, so call counts
    // accumulate across the whole file unless cleared here too — same reasoning as replace above.
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'submitLabGuess')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'resetLabRound')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'forgetMyLabEntry')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
  })

  it('opens the round at the seed from the URL', async () => {
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledWith('team', 'sample', 42)
    expect(replace).not.toHaveBeenCalled()
  })

  it('rolls a seed into the URL when there is none', async () => {
    // Requirement 1 holds from the first frame: the URL always carries the seed, so a reload is
    // by construction the same round.
    currentQuery = {}
    await mountPage()
    const seed = Number((replace.mock.calls[0][0] as { query: { seed: number } }).query.seed)
    expect(Number.isInteger(seed)).toBe(true)
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('replaces an unusable seed rather than sending it', async () => {
    currentQuery = { seed: 'not-a-number' }
    await mountPage()
    expect(replace).toHaveBeenCalled()
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('renders the stand-in game with its bounds', async () => {
    const w = await mountPage()
    expect(w.get('[data-test="sample-bounds"]').text()).toContain('100')
    expect(w.get('[data-test="sample-bounds"]').text()).toContain('199')
  })

  it('submits a guess from the stand-in game', async () => {
    const w = await mountPage()
    await w.get('[data-test="sample-input"]').setValue('123')
    await w.get('[data-test="sample-submit"]').trigger('submit')
    await flushPromises()
    expect(api.submitLabGuess).toHaveBeenCalledWith('team', 'sample', 42, { value: 123 })
  })

  it('resets the round', async () => {
    const w = await mountPage()
    await w.get('[data-test="lab-reset"]').trigger('click')
    await flushPromises()
    expect(api.resetLabRound).toHaveBeenCalledWith('team', 'sample', 42)
  })

  it('forgets my own entry', async () => {
    const w = await mountPage()
    await w.get('[data-test="lab-forget-mine"]').trigger('click')
    await flushPromises()
    expect(api.forgetMyLabEntry).toHaveBeenCalledWith('team', 'sample', 42)
  })

  it('rolls a new seed into the URL', async () => {
    const w = await mountPage()
    await w.get('[data-test="lab-roll"]').trigger('click')
    const seed = Number((replace.mock.calls[0][0] as { query: { seed: number } }).query.seed)
    expect(Number.isInteger(seed)).toBe(true)
  })

  it('refreshes to pick up another window s guess', async () => {
    const w = await mountPage()
    await w.get('[data-test="lab-refresh"]').trigger('click')
    await flushPromises()
    expect(api.openLabRound).toHaveBeenCalledTimes(2)
  })

  it('announces a round takeover', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, tookOverRound: true } as never)
    const w = await mountPage()
    expect(w.find('[data-test="lab-takeover"]').exists()).toBe(true)
  })

  it('lists the other testers', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { value: 150 },
          outcome: { correct: false, distance: 5, direction: 'LOWER' },
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)
    const w = await mountPage()
    expect(w.get('[data-test="lab-entries"]').text()).toContain('Bender')
  })

  it('says the lab is unavailable when the backend does not have it', async () => {
    // On production the beans do not exist, so the whole tree answers 404. That is the only
    // signal the SPA gets — the bundle is identical in every environment.
    vi.spyOn(api, 'openLabRound').mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountPage()
    expect(w.get('[data-test="lab-unavailable"]').exists()).toBe(true)
  })

  it('reports an unknown game id without blowing up', async () => {
    currentParams = { slug: 'team', game: 'nosuchgame' }
    const w = await mountPage()
    expect(w.get('[data-test="lab-unknown-game"]').exists()).toBe(true)
  })
})
