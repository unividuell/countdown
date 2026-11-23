import { describe, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SpotObjectReveal from '../SpotObjectReveal.vue'
import type { ScoreRow } from '../tips'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import { TIMELINE_TIMERS } from '@/games/__tests__/timelineTiming'

vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: vi.fn() })) }))

function row(userId: string, tick: number): ScoreRow {
  return {
    userId,
    name: userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    durationLabel: null,
    points: 1,
    provisional: false,
    tick,
  }
}

describe('SpotObjectReveal', () => {
  // The rule every reveal keeps — see `judgesWithVerdict`. No verdict here: only the rows land.
  it('judges with its verdict: my row lands silently, the others after', async () => {
    vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
    try {
      await expectJudgesWithVerdict({
        mount: () =>
          mount(SpotObjectReveal, {
            props: {
              tiles: [],
              rows: [row('me', 0), row('them', 1)],
              live: false,
              animate: true,
              canVote: false,
              review: {
                open: false,
                canOverride: false,
                vote: async () => {},
                override: async () => {},
              },
            },
            global: { stubs: { SpotObjectTipGrid: true } },
          }),
        mineUserId: 'me',
        judging: () => false,
        verdict: 'silent',
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
