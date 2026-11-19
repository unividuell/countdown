import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { initialPlacements } from '../gestures'
import MatchScaleReveal from '../MatchScaleReveal.vue'
import ScaleField from '../ScaleField.vue'
import { scoreboardRows } from '../scoreboard'
import type { MatchScalePayload } from '../types'
import { gameEntry } from '@/games/__tests__/gameFixtures'

enableAutoUnmount(afterEach)

const PAYLOAD: MatchScalePayload = {
  categoryName: 'Formen',
  a: { name: 'Alpha', path: 'M0 0H1000V500H0Z', width: 1000, height: 500, attribution: null },
  b: { name: 'Beta', path: 'M0 0H600V1000H0Z', width: 600, height: 1000, attribution: null },
  toleranceFactor: 1.1,
}

const ME = '#7c3aed'
const OTHER = '#0e7490'

const entries = [
  gameEntry({
    userId: 'me',
    guess: { scale: 1.3 },
    outcome: { scale: 1.3, deviation: 0.2, withinTolerance: false },
    points: 1,
    avatar: { bgColorHex: ME },
  }),
  gameEntry({
    userId: 'you',
    guess: { scale: 2 },
    outcome: { scale: 2, deviation: 0.22, withinTolerance: false },
    points: 0,
    avatar: { bgColorHex: OTHER },
  }),
]

function mountReveal(over: Record<string, unknown> = {}) {
  const mine = (over.mine ?? 'me') as string | null
  return mount(MatchScaleReveal, {
    props: {
      payload: PAYLOAD,
      factor: 1.6,
      myScale: 1.3,
      myColorHex: ME,
      mineUserId: mine,
      rows: scoreboardRows({ entries, factor: 1.6, awardRule: 'ALL_QUALIFYING', mineUserId: mine }),
      live: false,
      animate: false,
      ...over,
    },
  })
}

const field = (w: ReturnType<typeof mountReveal>) => w.getComponent(ScaleField)

describe('MatchScaleReveal', () => {
  it('shows B at the true factor and my tip as a dashed outline at the same corner', () => {
    const wrapper = mountReveal()
    const b = initialPlacements(PAYLOAD.a).b

    expect(field(wrapper).props('placementB')).toEqual({ ...b, scale: 1.6 })
    expect(field(wrapper).props('interactive')).toBe(false)
    expect(field(wrapper).props('outlines')).toEqual([
      { placement: { ...b, scale: 1.3 }, color: ME, dashed: true },
    ])
    expect(wrapper.text()).toContain('Dein Tipp: 1,3× · tatsächlich: 1,6×')
  })

  it('without animation it stands finished and carries no transition', () => {
    const wrapper = mountReveal({ animate: false })

    expect(field(wrapper).props('grow')).toBe(false)
  })

  it('animated, B grows from the tip to the factor after the beat', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    try {
      const wrapper = mountReveal({ animate: true })

      expect(field(wrapper).props('grow')).toBe(true)
      expect(field(wrapper).props('placementB').scale).toBe(1.3)

      await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS + 10)

      expect(field(wrapper).props('placementB').scale).toBe(1.6)
    } finally {
      vi.useRealTimers()
    }
  })

  it("a name toggles that player's outline in their colour", async () => {
    const wrapper = mountReveal()
    const b = initialPlacements(PAYLOAD.a).b

    await wrapper.get('[data-test="select-you"]').trigger('click')

    expect(field(wrapper).props('outlines')).toContainEqual({
      placement: { ...b, scale: 2 },
      color: OTHER,
      dashed: true,
    })

    await wrapper.get('[data-test="select-you"]').trigger('click')

    expect(field(wrapper).props('outlines')).toHaveLength(1)
  })

  it('without a tip of mine: B at the factor, no outline, no tip line', () => {
    const wrapper = mountReveal({ myScale: null, mine: null })

    expect(field(wrapper).props('placementB').scale).toBe(1.6)
    expect(field(wrapper).props('outlines')).toEqual([])
    expect(wrapper.text()).not.toContain('Dein Tipp')
  })

  it('names the sources under the field', () => {
    const payload = {
      ...PAYLOAD,
      b: { ...PAYLOAD.b, attribution: 'Bild: Jemand, CC BY' },
    }

    expect(mountReveal({ payload }).text()).toContain('Bild: Jemand, CC BY')
  })
})
