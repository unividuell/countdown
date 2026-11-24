import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import { TIMELINE_TIMERS } from '@/games/__tests__/timelineTiming'
import { playVerdict } from '@/ui/verdictSound'
import MixColorReveal from '../MixColorReveal.vue'
import { scoreboardRows } from '../scoreboard'

vi.mock('@/ui/verdictSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/verdictSound')>()),
  playVerdict: vi.fn(() => ({ stop: vi.fn() })),
}))

const entries = [
  gameEntry({
    userId: 'me',
    points: 1,
    outcome: { hex: '#112233', recipe: { c: 2 }, deviation: 3.2, withinTolerance: true },
  }),
  gameEntry({
    userId: 'other',
    points: 0,
    outcome: { hex: '#445566', recipe: { m: 1 }, deviation: 9.5, withinTolerance: false },
  }),
]

function mountReveal(over: Record<string, unknown> = {}) {
  return mount(MixColorReveal, {
    props: {
      payload: {
        targetHex: '#336699',
        capacity: 6,
        pigments: [
          { key: 'c', name: 'Cyan', hex: '#00AEEF' },
          { key: 'm', name: 'Magenta', hex: '#EC008C' },
        ],
      },
      solution: { recipe: { c: 3, m: 1 }, tolerance: 4 },
      rows: scoreboardRows({ entries, awardRule: 'ALL_QUALIFYING', mineUserId: 'me' }),
      mineUserId: 'me',
      won: true,
      live: false,
      animate: false,
      ...over,
    },
  })
}

describe('MixColorReveal', () => {
  // The rule every reveal keeps — see `judgesWithVerdict`.
  it('judges with its verdict: the facts and the sound come with my row', async () => {
    vi.useFakeTimers({ toFake: [...TIMELINE_TIMERS, 'setInterval', 'clearInterval'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    try {
      await expectJudgesWithVerdict({
        mount: () => mountReveal({ animate: true }),
        mineUserId: 'me',
        judging: () => false,
        verdict: 'sound',
      })
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
    expect(playVerdict).toHaveBeenCalled()
  })
})
