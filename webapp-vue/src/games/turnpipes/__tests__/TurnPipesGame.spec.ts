import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { gameProps } from '@/games/__tests__/gameFixtures'
import type { GameProps } from '@/games/GameProps'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'
import { draftKey } from '../draft'
import TurnPipesBoard from '../TurnPipesBoard.vue'
import TurnPipesGame from '../TurnPipesGame.vue'
import TurnPipesReveal from '../TurnPipesReveal.vue'
import type { PipeKindCode, TurnPipesPayload } from '../types'

vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref({ id: 'me', isSuperAdmin: false }) }) }
})

const SIZE = 6
const KINDS: PipeKindCode[] = Array.from({ length: SIZE * SIZE }, () => 'STRAIGHT')
KINDS[0] = 'INLET'
KINDS[1] = 'OUTLET'
const PAYLOAD: TurnPipesPayload = {
  size: SIZE,
  kinds: KINDS,
  start: Array.from({ length: SIZE * SIZE }, () => 0),
}
const GUESS = { rotations: Array.from({ length: SIZE * SIZE }, () => 1) }

function mountGame(over: Partial<GameProps> = {}) {
  return mount(TurnPipesGame, {
    props: gameProps({
      payload: PAYLOAD,
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      closed: false,
      sealed: false,
      scene: null,
      ...over,
    }),
    global: { stubs: { TurnPipesBoard: true, TurnPipesReveal: true } },
  })
}

describe('TurnPipesGame', () => {
  beforeEach(() => localStorage.clear())

  it('an unreadable payload says so', () => {
    expect(mountGame({ payload: { size: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it("sealed shows the board with the scene's size", () => {
    const board = mountGame({ sealed: true, payload: null, scene: { size: 7 } }).getComponent(
      TurnPipesBoard,
    )

    expect(board.props('sealed')).toBe(true)
    expect(board.props('scene')).toEqual({ size: 7 })
  })

  it('plays on the board with a draft key for me, this round and its phase', () => {
    const board = mountGame().getComponent(TurnPipesBoard)

    expect(board.props('draftKey')).toBe(draftKey({ userId: 'me', payload: PAYLOAD, timed: false }))
  })

  it('a guess of mine shows the reveal and clears my draft', async () => {
    const key = draftKey({ userId: 'me', payload: PAYLOAD, timed: false })
    localStorage.setItem(key, JSON.stringify(GUESS.rotations))
    const wrapper = mountGame()

    await wrapper.setProps({
      myGuess: GUESS,
      outcome: { correct: true, wet: [0, 1], leak: null },
    })

    expect(wrapper.findComponent(TurnPipesReveal).exists()).toBe(true)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it("the board's guess is passed up", () => {
    const wrapper = mountGame()

    wrapper.getComponent(TurnPipesBoard).vm.$emit('guess', GUESS)

    expect(wrapper.emitted('guess')).toEqual([[GUESS]])
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['turn-pipes']).toBeDefined()
    expect(labGameList).toContainEqual({ id: 'turn-pipes', title: 'Verrohrung' })
  })
})
