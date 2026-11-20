import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { gameProps } from '@/games/__tests__/gameFixtures'
import type { GameProps } from '@/games/GameProps'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'
import { draftKey } from '../draft'
import MatchScaleBoard from '../MatchScaleBoard.vue'
import MatchScaleGame from '../MatchScaleGame.vue'
import MatchScaleReveal from '../MatchScaleReveal.vue'
import type { MatchScalePayload } from '../types'

vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref({ id: 'me', isSuperAdmin: false }) }) }
})

const PAYLOAD: MatchScalePayload = {
  categoryName: 'Formen',
  a: { name: 'Alpha', path: 'M0 0H1000V500H0Z', width: 1000, height: 500, attribution: null },
  b: { name: 'Beta', path: 'M0 0H600V1000H0Z', width: 600, height: 1000, attribution: null },
  toleranceFactor: 1.1,
}

function mountGame(over: Partial<GameProps> = {}) {
  return mount(MatchScaleGame, {
    props: gameProps({ payload: PAYLOAD, awardRule: 'ALL_QUALIFYING', awardPoints: 1, ...over }),
    global: { stubs: { MatchScaleBoard: true, MatchScaleReveal: true } },
  })
}

describe('MatchScaleGame', () => {
  beforeEach(() => localStorage.clear())

  it('an unreadable payload says so', () => {
    const wrapper = mountGame({ payload: { categoryName: 'x', a: null } })

    expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
    expect(wrapper.findComponent(MatchScaleBoard).exists()).toBe(false)
  })

  it('plays on the board with a draft key for me, this round and its phase', () => {
    const board = mountGame({ awardRule: 'CLOSEST_ONLY' }).getComponent(MatchScaleBoard)

    expect(board.props('payload')).toEqual(PAYLOAD)
    expect(board.props('draftKey')).toBe(draftKey({ userId: 'me', payload: PAYLOAD, timed: true }))
  })

  it("the board's guess is passed up", () => {
    const wrapper = mountGame()

    wrapper.getComponent(MatchScaleBoard).vm.$emit('guess', { scale: 1.3 })

    expect(wrapper.emitted('guess')).toEqual([[{ scale: 1.3 }]])
  })

  it('a guess of mine clears my draft', async () => {
    const key = draftKey({ userId: 'me', payload: PAYLOAD, timed: false })
    localStorage.setItem(key, '{}')
    const wrapper = mountGame()

    await wrapper.setProps({ myGuess: { scale: 1.3 } })

    expect(localStorage.getItem(key)).toBeNull()
  })

  it('a solution replaces the board', () => {
    const wrapper = mountGame({
      myGuess: { scale: 1.3 },
      solution: { factor: 1.6, toleranceFactor: 1.1 },
    })

    expect(wrapper.findComponent(MatchScaleBoard).exists()).toBe(false)
    expect(wrapper.findComponent(MatchScaleReveal).props('factor')).toBe(1.6)
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['match-scale']).toBe(MatchScaleGame)
    expect(labGameList).toContainEqual({ id: 'match-scale', title: 'Augenmaß' })
  })
})
