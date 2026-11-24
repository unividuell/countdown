import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { gameEntry, gameProps } from '@/games/__tests__/gameFixtures'
import type { GameProps } from '@/games/GameProps'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'
import MixColorBoard from '../MixColorBoard.vue'
import MixColorGame from '../MixColorGame.vue'
import MixColorReveal from '../MixColorReveal.vue'
import MixerGlass from '../MixerGlass.vue'

enableAutoUnmount(afterEach)

const PAYLOAD = {
  targetHex: '#336699',
  capacity: 6,
  pigments: [
    { key: 'c', name: 'Cyan', hex: '#00AEEF' },
    { key: 'm', name: 'Magenta', hex: '#EC008C' },
  ],
}

const SOLUTION = { recipe: { c: 3, m: 1 }, tolerance: 4 }

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
  gameEntry({ userId: 'quitter' }),
]

function mountGame(over: Partial<GameProps> = {}) {
  return mount(MixColorGame, {
    props: gameProps({ payload: PAYLOAD, awardRule: 'ALL_QUALIFYING', ...over }),
  })
}

function revealed() {
  return mountGame({ solution: SOLUTION, entries, mineUserId: 'me' })
}

/** The circle's slices, in order. */
const slices = (w: ReturnType<typeof mountGame>) =>
  w.findAll('[data-test="pie-slice"]').map((slice) => slice.attributes('fill'))

const dots = (w: ReturnType<typeof mountGame>) =>
  w.findAll('[data-test="pie-dot"]').map((dot) => dot.attributes('fill'))

describe('MixColorGame', () => {
  it('an unreadable payload says so', () => {
    const w = mountGame({ payload: { targetHex: 'x' } })

    expect(w.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
  })

  it('plays on the board until the solution arrives', () => {
    const w = mountGame()

    expect(w.findComponent(MixColorBoard).exists()).toBe(true)
    expect(w.findComponent(MixColorReveal).exists()).toBe(false)
  })

  it('a solution replaces the board with the reveal', () => {
    const w = revealed()

    expect(w.findComponent(MixColorBoard).exists()).toBe(false)
    expect(w.findComponent(MixColorReveal).exists()).toBe(true)
  })

  it("re-emits the board's skip and guess", () => {
    const w = mountGame()
    const board = w.getComponent(MixColorBoard)

    board.vm.$emit('skip', 2, { base: 'c' })
    board.vm.$emit('guess', { drops: 3 })

    expect(w.emitted('skip')).toEqual([[2, { base: 'c' }]])
    expect(w.emitted('guess')).toEqual([[{ drops: 3 }]])
  })

  it('starts with my mix as the whole circle', () => {
    expect(slices(revealed())).toEqual(['#112233'])
  })

  describe('the circle', () => {
    beforeEach(() =>
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }),
    )
    afterEach(() => vi.useRealTimers())

    /** Taps a name and lets the slices finish moving. */
    async function toggle(w: ReturnType<typeof mountGame>, userId: string) {
      await w.get(`[data-test="select-${userId}"]`).trigger('click')
      vi.advanceTimersByTime(1000)
      await w.vm.$nextTick()
    }

    it('toggles each name on its own: one slice per selected player', async () => {
      const w = revealed()

      await toggle(w, 'other')
      expect(slices(w)).toEqual(['#112233', '#445566'])
      expect(dots(w)).toHaveLength(2)

      await toggle(w, 'me')
      expect(slices(w)).toEqual(['#445566'])
    })

    it('orders the slices like the scoreboard, not like the taps', async () => {
      const w = revealed()

      await toggle(w, 'me')
      await toggle(w, 'other')
      await toggle(w, 'me')

      expect(slices(w)).toEqual(['#112233', '#445566'])
    })

    it('with nobody selected the circle is the empty grey', async () => {
      const w = revealed()

      await toggle(w, 'me')

      expect(slices(w)).toEqual([])
      expect(w.getComponent(MixerGlass).get('[data-test="mixer-fill"]').attributes('fill')).toBe(
        '#8C8C8C',
      )
    })

    it('a given-up player cannot be selected', async () => {
      const w = revealed()

      await toggle(w, 'quitter')

      expect(slices(w)).toEqual(['#112233'])
    })
  })

  it('names the tolerance in phase one only', () => {
    expect(revealed().text()).toContain('≤ 4,0')

    const phaseTwo = mountGame({
      solution: { ...SOLUTION, tolerance: null },
      entries,
      mineUserId: 'me',
    })
    expect(phaseTwo.find('[data-test="mix-color-tolerance"]').exists()).toBe(false)
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['mix-color']).toBe(MixColorGame)
    expect(labGameList).toContainEqual({ id: 'mix-color', title: 'Anrührung' })
  })
})
