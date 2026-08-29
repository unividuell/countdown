import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as roundsApi from '@/api/rounds'
import type { MyPlayDto, OtherPlayDto, RoundResponse } from '@/api/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  useRoute: () => ({ params: { slug: 'team', roundNumber: '12', userId: 'u2' } }),
}))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({ community: { value: { slug: 'team' } }, refresh: vi.fn() }),
}))

const anOther = (over: Partial<OtherPlayDto> = {}): OtherPlayDto => ({
  userId: 'u2',
  username: 'Leela',
  avatar: { shortName: 'LEE', bgColorHex: '#40bf7a' },
  stage: 0,
  guess: { panoId: 'pano-1', heading: 10, pitch: -5, zoom: 1 },
  outcome: { country: 'DE' },
  points: null,
  durationMs: null,
  votes: [],
  struck: false,
  adminOverride: null,
  ...over,
})

const aPlay = (over: Partial<MyPlayDto> = {}): MyPlayDto => ({
  ...anOther({ userId: 'u1', username: 'Fry' }),
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  revealedAt: '2026-08-14T11:00:00Z',
  guessedAt: '2026-08-14T12:00:00Z',
  ...over,
})

const aRound = (over: Partial<RoundResponse> = {}): RoundResponse => ({
  round: { number: 12, label: 'T-12', start: '2026-08-14T10:00:00Z', end: '2026-08-15T10:00:00Z' },
  game: { id: 'spot-object', displayName: 'Weltanschauung', requiresReveal: false },
  noGameReason: null,
  previousRoundNumber: null,
  payload: { term: 'Roter Briefkasten' },
  solution: null,
  me: aPlay(),
  others: [anOther()],
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  canOverride: false,
  ...over,
})

async function page() {
  const Page = (await import('@/pages/c/[slug]/rounds/[roundNumber]/tips/[userId].vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('single tip page', () => {
  it('loads the running round when the number matches it', async () => {
    vi.spyOn(roundsApi, 'getCurrentRound').mockResolvedValue(aRound())
    const getRound = vi.spyOn(roundsApi, 'getRound')

    const w = await page()

    expect(roundsApi.getCurrentRound).toHaveBeenCalledWith('team')
    expect(getRound).not.toHaveBeenCalled()
    expect(w.find('[data-test="tip-close"]').exists()).toBe(true)
  })

  it('loads a past round otherwise', async () => {
    vi.spyOn(roundsApi, 'getCurrentRound').mockResolvedValue(
      aRound({ round: { number: 13, label: 'T-13', start: 'x', end: 'y' } }),
    )
    const getRound = vi.spyOn(roundsApi, 'getRound').mockResolvedValue(aRound())

    await page()

    expect(getRound).toHaveBeenCalledWith('team', 12)
  })

  it('says so when the tip is not in the round', async () => {
    vi.spyOn(roundsApi, 'getCurrentRound').mockResolvedValue(aRound({ others: [] }))

    const w = await page()

    expect(w.find('[data-test="tip-missing"]').exists()).toBe(true)
  })

  it('sends the vote and redraws from the response', async () => {
    vi.spyOn(roundsApi, 'getCurrentRound').mockResolvedValue(aRound())
    const updated = aRound({
      others: [anOther({ votes: [{ userId: 'u1', username: 'Fry', value: 'CONFIRM' }] })],
    })
    const castVote = vi.spyOn(roundsApi, 'castVote').mockResolvedValue(updated)

    const w = await page()
    await w.get('[data-test="tip-confirm"]').trigger('click')
    await flushPromises()

    expect(castVote).toHaveBeenCalledWith('team', 12, 'u2', 'CONFIRM')
    // Redrawn from the response, not derived locally: Fry's name now shows among the confirms.
    expect(w.text()).toContain('Fry')
  })
})
