import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { FIELD_PX, initialPlacements, sizeAt } from '../gestures'
import MatchScaleReveal from '../MatchScaleReveal.vue'
import ScaleField from '../ScaleField.vue'
import { scoreboardRows } from '../scoreboard'
import type { MatchScalePayload } from '../types'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { playCount } from '../countSound'
import { countTones } from '../countTones'

const stopCount = vi.fn()
vi.mock('../countSound', () => ({
  playCount: vi.fn(() => ({ stop: stopCount })),
  unlockSound: vi.fn(),
}))

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
      from: null,
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
    expect(wrapper.find('[data-test="match-scale-line"]').exists()).toBe(false)
  })

  it('my name starts pressed and toggles my outline off and on', async () => {
    const wrapper = mountReveal()
    const mine = () => wrapper.get('[data-test="select-me"]')

    expect(mine().attributes('aria-pressed')).toBe('true')

    await mine().trigger('click')

    expect(mine().attributes('aria-pressed')).toBe('false')
    expect(field(wrapper).props('outlines')).toEqual([])

    await mine().trigger('click')

    expect(mine().attributes('aria-pressed')).toBe('true')
    expect(field(wrapper).props('outlines')).toHaveLength(1)
  })

  it("with my outline off, another player's tip shows alone", async () => {
    const wrapper = mountReveal()

    await wrapper.get('[data-test="select-me"]').trigger('click')
    await wrapper.get('[data-test="select-you"]').trigger('click')

    expect(field(wrapper).props('outlines')).toEqual([
      { placement: { ...initialPlacements(PAYLOAD.a).b, scale: 2 }, color: OTHER, dashed: true },
    ])
  })

  it('heads the table with the solution over the tips and the tolerance over the distance', () => {
    const wrapper = mountReveal()

    expect(wrapper.get('[data-test="match-scale-solution"]').text()).toBe('1,6×')
    expect(wrapper.get('[data-test="match-scale-tolerance"]').text()).toBe('± 10 %')
    expect(wrapper.text()).toContain('Lösung')
    expect(wrapper.text()).toContain('Toleranz')
  })

  it('in phase two the head names no tolerance', () => {
    const wrapper = mountReveal({ payload: { ...PAYLOAD, toleranceFactor: null } })

    expect(wrapper.get('[data-test="match-scale-solution"]').text()).toBe('1,6×')
    expect(wrapper.find('[data-test="match-scale-tolerance"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Toleranz')
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

  describe('the count while B grows', () => {
    beforeEach(() => {
      vi.mocked(playCount).mockClear()
      stopCount.mockClear()
    })

    afterEach(() => {
      localStorage.clear()
      vi.useRealTimers()
    })

    it('plays from my tip to the factor at the beat, and stops on unmount', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      const wrapper = mountReveal({ animate: true })

      await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS - 10)
      expect(playCount).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(20)
      expect(playCount).toHaveBeenCalledExactlyOnceWith(countTones(1.3, 1.6, 0.7))

      wrapper.unmount()
      expect(stopCount).toHaveBeenCalled()
    })

    it('muting stops it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      const wrapper = mountReveal({ animate: true })
      await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS + 10)

      await wrapper.get('button[aria-label="Ton"]').trigger('click')

      expect(stopCount).toHaveBeenCalled()
    })

    it('stays silent when muted, and without animation', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      mountReveal({ animate: false })
      localStorage.setItem('games:sound', 'false')
      mountReveal({ animate: true })

      await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS + 10)

      expect(playCount).not.toHaveBeenCalled()
    })
  })

  describe('after my own submit', () => {
    const AMBER = 'var(--color-match-scale-b)'
    const BOARD_VIEW = { left: -1, top: 9, cellPx: 30 }
    const SENT = { x: 4, y: 1, scale: 1.3 }
    const FROM = { view: BOARD_VIEW, b: SENT }

    it('the tip starts as B left the board and eases into my dashed outline', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      try {
        const wrapper = mountReveal({ animate: true, from: FROM })
        const corner = initialPlacements(PAYLOAD.a).b

        expect(field(wrapper).props('outlines')).toEqual([
          { placement: SENT, color: AMBER, dashed: true, filled: true, eased: true },
        ])
        expect(field(wrapper).props('camera')).toEqual({ from: BOARD_VIEW, moved: false })
        expect(field(wrapper).props('bHidden')).toBe(true)

        // Two frames: the board's state is painted before it eases away.
        await vi.advanceTimersByTimeAsync(50)

        expect(field(wrapper).props('outlines')).toEqual([
          { placement: { ...corner, scale: 1.3 }, color: ME, dashed: true, eased: true },
        ])
        expect(field(wrapper).props('camera')).toEqual({ from: BOARD_VIEW, moved: true })
        expect(field(wrapper).props('placementB').scale).toBe(1.3)

        await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS)

        expect(field(wrapper).props('outlines')).toEqual([
          { placement: { ...corner, scale: 1.3 }, color: ME, dashed: true },
        ])
        expect(field(wrapper).props('camera')).toBeNull()
        expect(field(wrapper).props('bHidden')).toBe(false)
        expect(field(wrapper).props('placementB').scale).toBe(1.6)
      } finally {
        vi.useRealTimers()
      }
    })

    it('without animation it shows the end state at once', () => {
      const wrapper = mountReveal({ animate: false, from: FROM })
      const corner = initialPlacements(PAYLOAD.a).b

      expect(field(wrapper).props('outlines')).toEqual([
        { placement: { ...corner, scale: 1.3 }, color: ME, dashed: true },
      ])
      expect(field(wrapper).props('camera')).toBeNull()
      expect(field(wrapper).props('bHidden')).toBe(false)
      expect(field(wrapper).props('placementB').scale).toBe(1.6)
    })

    it('a board state of another tip does not travel', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      try {
        const wrapper = mountReveal({ animate: true, from: { ...FROM, b: { ...SENT, scale: 2 } } })

        expect(field(wrapper).props('camera')).toBeNull()
        expect(field(wrapper).props('bHidden')).toBe(false)
        expect(field(wrapper).props('outlines')[0]?.filled).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })
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

  it('refits so a far-off selected tip lies inside the view', async () => {
    const far = [
      entries[0]!,
      gameEntry({
        userId: 'far',
        guess: { scale: 5 },
        outcome: { scale: 5, deviation: 1.1, withinTolerance: false },
        points: 0,
      }),
    ]
    const rows = scoreboardRows({
      entries: far,
      factor: 1.6,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'me',
    })
    const wrapper = mountReveal({ rows })

    await wrapper.get('[data-test="select-far"]').trigger('click')

    const view = field(wrapper).props('view')
    const corner = initialPlacements(PAYLOAD.a).b
    const { w, h } = sizeAt(PAYLOAD.b, 5)
    const extent = FIELD_PX / view.cellPx

    expect(corner.x + w).toBeLessThanOrEqual(view.left + extent)
    expect(corner.y + h).toBeLessThanOrEqual(view.top)
    expect(corner.y).toBeGreaterThanOrEqual(view.top - extent)
  })

  it('without a tip of mine: B at the factor, no outline', () => {
    const wrapper = mountReveal({ myScale: null, mine: null })

    expect(field(wrapper).props('placementB').scale).toBe(1.6)
    expect(field(wrapper).props('outlines')).toEqual([])
  })

  it('names the sources under the field', () => {
    const payload = {
      ...PAYLOAD,
      b: { ...PAYLOAD.b, attribution: 'Bild: Jemand, CC BY' },
    }

    expect(mountReveal({ payload }).text()).toContain('Bild: Jemand, CC BY')
  })

  it('names a credit shared by A and B once', () => {
    const credit = 'Bild: Jemand, CC BY'
    const payload = {
      ...PAYLOAD,
      a: { ...PAYLOAD.a, attribution: credit },
      b: { ...PAYLOAD.b, attribution: credit },
    }
    const wrapper = mountReveal({ payload })

    expect(wrapper.findAll('[data-test="match-scale-attribution"]')).toHaveLength(1)
  })

  it('after the growth B stops easing, so a refit moves it with the rest', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    try {
      const far = [
        entries[0]!,
        gameEntry({
          userId: 'far',
          guess: { scale: 5 },
          outcome: { scale: 5, deviation: 1.1, withinTolerance: false },
          points: 0,
        }),
      ]
      const rows = scoreboardRows({
        entries: far,
        factor: 1.6,
        awardRule: 'ALL_QUALIFYING',
        mineUserId: 'me',
      })
      const wrapper = mountReveal({ animate: true, rows })
      const b = () => wrapper.get('[data-test="match-scale-b"]')

      await vi.advanceTimersByTimeAsync(SOLUTION_DELAY_MS + 10)

      expect(field(wrapper).props('grow')).toBe(true)
      expect(b().classes()).toContain('transition-[transform,opacity]')

      await vi.advanceTimersByTimeAsync(800)

      expect(field(wrapper).props('grow')).toBe(false)
      expect(b().classes()).not.toContain('transition-[transform,opacity]')

      const before = b().attributes('transform')

      await wrapper.get('[data-test="select-far"]').trigger('click')

      expect(b().attributes('transform')).not.toBe(before)
      expect(b().attributes('style') ?? '').not.toContain('transform')
    } finally {
      vi.useRealTimers()
    }
  })

  it('without a tip of mine B never eases, so a refit moves it with the rest', async () => {
    const wrapper = mountReveal({ animate: true, myScale: null, mine: null })
    const b = () => wrapper.get('[data-test="match-scale-b"]')

    await nextTick()

    expect(field(wrapper).props('grow')).toBe(false)
    expect(b().classes()).not.toContain('transition-[transform,opacity]')

    const before = b().attributes('transform')

    await wrapper.get('[data-test="select-you"]').trigger('click')

    expect(b().attributes('transform')).not.toBe(before)
    expect(b().attributes('style') ?? '').not.toContain('transform')
  })
})
