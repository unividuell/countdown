import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GameEntry } from '@/games/GameEntry'
import PlacePatchBoard from '@/games/placepatch/PlacePatchBoard.vue'
import PlacePatchGame from '@/games/placepatch/PlacePatchGame.vue'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { x: 7, y: 4 },
  outcome: { correct: true },
  points: 1,
  durationMs: null,
  avatar: { bgColorHex: '#7c3aed' },
  votes: [],
  struck: false,
  adminOverride: null,
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(PlacePatchGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: 'mine',
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      assetUrl: (key: number) => `/assets/${key}`,
      ...over,
    },
  })
}

describe('PlacePatchGame', () => {
  it('plays on the board with both pictures once the payload is there', () => {
    const board = mountGame().getComponent(PlacePatchBoard)

    expect(board.props('boardSrc')).toBe('/assets/0')
    expect(board.props('patchSrc')).toBe('/assets/1')
  })

  it('hands the sealed board no picture at all', () => {
    const board = mountGame({
      payload: null,
      sealed: true,
      scene: { cols: 40, rows: 30 },
    }).getComponent(PlacePatchBoard)

    expect(board.props('boardSrc')).toBeNull()
    expect(board.props('patchSrc')).toBeNull()
  })

  it('shows the submitted tip after a reload', () => {
    const board = mountGame({ myGuess: { x: 7, y: 4 }, disabled: true }).getComponent(
      PlacePatchBoard,
    )

    expect(board.props('submitted')).toEqual({ x: 7, y: 4 })
  })

  it('turns into the reveal once the solution is there', () => {
    const wrapper = mountGame({
      solution: { x: 7, y: 4 },
      entries: [MINE],
      myGuess: { x: 7, y: 4 },
    })

    expect(wrapper.findComponent(PlacePatchReveal).exists()).toBe(true)
  })

  it('says it cannot render a round without asset URLs', () => {
    expect(mountGame({ assetUrl: undefined }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['place-patch']).toBe(PlacePatchGame)
    expect(labGameList).toContainEqual({ id: 'place-patch', title: 'Platzierung' })
  })
})
