import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { gameProps } from '@/games/__tests__/gameFixtures'
import type { GameProps } from '@/games/GameProps'
import { gameComponents } from '@/games/registry'
import StackFloorBoard from '../StackFloorBoard.vue'
import StackFloorGame from '../StackFloorGame.vue'
import StackFloorReveal from '../StackFloorReveal.vue'

const SCENE = { fieldWidth: 1000, startWidth: 660, hueStart: 100 }
const PAYLOAD = {
  ...SCENE,
  speedNum: 1,
  speedDen: 2,
  pauseMs: 300,
  maxFloors: 999,
  target: null,
}
const GUESS = { clicks: [100, 200], restarted: false }

function mountGame(over: Partial<GameProps> = {}) {
  return mount(StackFloorGame, {
    props: gameProps({
      payload: PAYLOAD,
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      closed: false,
      sealed: false,
      scene: null,
      ...over,
    }),
    global: { stubs: { StackFloorBoard: true, StackFloorReveal: true } },
  })
}

describe('StackFloorGame', () => {
  it('an unreadable payload says so', () => {
    expect(mountGame({ payload: { fieldWidth: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it('sealed shows the board with the scene', () => {
    const board = mountGame({ sealed: true, payload: null, scene: SCENE }).getComponent(
      StackFloorBoard,
    )

    expect(board.props('sealed')).toBe(true)
    expect(board.props('scene')).toEqual(SCENE)
  })

  it('a guess of mine shows the reveal', () => {
    const wrapper = mountGame({ myGuess: GUESS })

    expect(wrapper.findComponent(StackFloorReveal).exists()).toBe(true)
    expect(wrapper.findComponent(StackFloorBoard).exists()).toBe(false)
  })

  it('a closed round without a guess of mine shows the reveal, not the board', () => {
    const wrapper = mountGame({ closed: true })

    expect(wrapper.findComponent(StackFloorReveal).exists()).toBe(true)
    expect(wrapper.findComponent(StackFloorBoard).exists()).toBe(false)
  })

  it('is live only while the award rule is CLOSEST_ONLY', () => {
    const live = (awardRule: GameProps['awardRule']) =>
      mountGame({ closed: true, awardRule }).getComponent(StackFloorReveal).props('live')

    expect(live('CLOSEST_ONLY')).toBe(true)
    expect(live('ALL_QUALIFYING')).toBe(false)
  })

  it("the board's guess is passed up", () => {
    const wrapper = mountGame()

    wrapper.getComponent(StackFloorBoard).vm.$emit('guess', GUESS)

    expect(wrapper.emitted('guess')).toEqual([[GUESS]])
  })

  it('is in the registry', () => {
    expect(gameComponents['stack-floor']).toBeDefined()
  })
})
