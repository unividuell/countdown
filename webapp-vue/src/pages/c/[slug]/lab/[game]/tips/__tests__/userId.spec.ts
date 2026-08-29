import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as labApi from '@/gamelab/api'
import type { LabEntryDto, LabRoundResponse } from '@/gamelab/types'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  useRoute: () => ({
    params: { slug: 'team', game: 'spot-object', userId: 'u2' },
    query: { seed: '42', phase: 'ONE' },
  }),
}))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({ community: { value: { slug: 'team' } }, refresh: vi.fn() }),
}))

const anOther = (over: Partial<LabEntryDto> = {}): LabEntryDto => ({
  userId: 'u2',
  username: 'Leela',
  avatar: { shortName: 'LEE', bgColorHex: '#40bf7a' },
  guess: { panoId: 'pano-1', heading: 10, pitch: -5, zoom: 1 },
  outcome: { country: 'DE' },
  at: '2026-08-14T12:00:00Z',
  points: 0,
  stage: 0,
  durationMs: null,
  votes: [],
  struck: false,
  adminOverride: null,
  ...over,
})

const aMe = (over: Partial<LabEntryDto> = {}): LabEntryDto => ({
  ...anOther({ userId: 'u1', username: 'Fry' }),
  avatar: { shortName: 'FRY', bgColorHex: '#bf40b3' },
  ...over,
})

const aRound = (over: Partial<LabRoundResponse> = {}): LabRoundResponse => ({
  seed: 42,
  game: 'spot-object',
  displayName: 'Weltanschauung',
  phase: 'ONE',
  payload: { term: 'Roter Briefkasten' },
  solution: null,
  me: aMe(),
  others: [anOther()],
  tookOverRound: false,
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  myStage: 0,
  revealed: true,
  canOverride: true,
  ...over,
})

async function page() {
  const Page = (await import('@/pages/c/[slug]/lab/[game]/tips/[userId].vue')).default
  const w = mount(Page)
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('lab single tip page', () => {
  it('opens a lab tip from the seeded round', async () => {
    vi.spyOn(labApi, 'openLabRound').mockResolvedValue(aRound())

    const w = await page()

    expect(labApi.openLabRound).toHaveBeenCalledWith('team', 'spot-object', 42, 'ONE')
    expect(w.find('[data-test="tip-close"]').exists()).toBe(true)
  })

  it('lets anybody set the override, because canOverride is true', async () => {
    vi.spyOn(labApi, 'openLabRound').mockResolvedValue(aRound())

    const w = await page()

    expect(w.find('[data-test="tip-override"]').exists()).toBe(true)
  })

  it('sends the vote through the lab endpoint', async () => {
    vi.spyOn(labApi, 'openLabRound').mockResolvedValue(aRound())
    const updated = aRound({
      others: [anOther({ votes: [{ userId: 'u1', username: 'Fry', value: 'CONFIRM' }] })],
    })
    const castLabVote = vi.spyOn(labApi, 'castLabVote').mockResolvedValue(updated)

    const w = await page()
    await w.get('[data-test="tip-confirm"]').trigger('click')
    await flushPromises()

    expect(castLabVote).toHaveBeenCalledWith('team', 'spot-object', 42, 'ONE', 'u2', 'CONFIRM')
    expect(w.text()).toContain('Fry')
  })

  it('carries seed and phase back to the round on close', async () => {
    vi.spyOn(labApi, 'openLabRound').mockResolvedValue(aRound())

    const w = await page()

    expect(w.get('[data-test="tip-close"]').attributes('href')).toBe(
      '/c/team/lab/spot-object?seed=42&phase=ONE',
    )
  })
})
