import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterBoard from '../DedusterBoard.vue'
import DedusterGame from '../DedusterGame.vue'
import DedusterReveal from '../DedusterReveal.vue'

vi.mock('../photo', () => ({ loadPhoto: vi.fn(() => Promise.resolve()) }))

const SCENE = { cols: 2, rows: 2, intervalMs: 1000 }
const PAYLOAD = { ...SCENE, order: [3, 1, 0, 2] }

function mountGame(props: Record<string, unknown> = {}) {
  return mount(DedusterGame, {
    props: {
      payload: null,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: 'me',
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      assetUrl: (key: number) => `/asset/${key}`,
      sealed: true,
      scene: SCENE,
      ...props,
    },
  })
}

describe('DedusterGame', () => {
  it('mounts the board under the cover while sealed, with the scene photo', () => {
    const board = mountGame().getComponent(DedusterBoard)

    expect(board.props('sealed')).toBe(true)
    expect(board.props('photoUrl')).toBe('/asset/98')
    expect(board.props('scene')).toEqual(SCENE)
  })

  it('turns to the evaluation once a guess of mine is in', () => {
    const w = mountGame({
      sealed: false,
      payload: PAYLOAD,
      myGuess: { reactionsMs: [], endedBy: 'TOO_LATE', wrongTileIndex: null, restarted: false },
    })

    expect(w.findComponent(DedusterReveal).exists()).toBe(true)
    expect(w.findComponent(DedusterBoard).exists()).toBe(false)
  })

  it('forwards the board’s guess and reveal', () => {
    const w = mountGame()
    const board = w.getComponent(DedusterBoard)

    board.vm.$emit('reveal')
    board.vm.$emit('guess', {
      reactionsMs: [],
      endedBy: 'TOO_LATE',
      wrongTileIndex: null,
      restarted: false,
    })

    expect(w.emitted('reveal')).toHaveLength(1)
    expect(w.emitted('guess')).toHaveLength(1)
  })

  it('says so instead of rendering junk', () => {
    expect(mountGame({ scene: { cols: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })
})
