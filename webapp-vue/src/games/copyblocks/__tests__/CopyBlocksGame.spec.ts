import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CopyBlocksBoard from '@/games/copyblocks/CopyBlocksBoard.vue'
import CopyBlocksGame from '@/games/copyblocks/CopyBlocksGame.vue'
import CopyBlocksReveal from '@/games/copyblocks/CopyBlocksReveal.vue'
import { draftKey, saveDraft } from '@/games/copyblocks/draft'
import type { CopyBlocksPayload } from '@/games/copyblocks/types'
import type { GameProps } from '@/games/GameProps'
import { gameProps } from '@/games/__tests__/gameFixtures'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref({ id: 'me', isSuperAdmin: false }) }) }
})

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}
const GUESS = { blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' as const }] }

function mountGame(over: Partial<GameProps> = {}) {
  return mount(CopyBlocksGame, {
    props: gameProps({
      payload: PAYLOAD,
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      closed: false,
      sealed: false,
      scene: null,
      ...over,
    }),
    global: { stubs: { CopyBlocksBoard: true, CopyBlocksReveal: true } },
  })
}

describe('CopyBlocksGame', () => {
  beforeEach(() => localStorage.clear())

  it('plays on the board, with a draft key for me, this round and its phase', () => {
    const board = mountGame().getComponent(CopyBlocksBoard)

    expect(board.props('draftKey')).toBe(draftKey({ userId: 'me', payload: PAYLOAD, timed: false }))
  })

  it('switches to the reveal once my tip is in, and forgets the draft', async () => {
    const key = draftKey({ userId: 'me', payload: PAYLOAD, timed: false })
    saveDraft(localStorage, key, GUESS.blocks)
    const wrapper = mountGame()

    await wrapper.setProps({
      myGuess: GUESS,
      outcome: {
        correct: true,
        fit: { turns: 0, dx: 0, dy: 0, dz: 0 },
        missing: [],
        extra: [],
        wrongType: [],
      },
    })

    expect(wrapper.findComponent(CopyBlocksReveal).exists()).toBe(true)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('keeps the draft while no tip of mine is in', async () => {
    const key = draftKey({ userId: 'me', payload: PAYLOAD, timed: false })
    saveDraft(localStorage, key, GUESS.blocks)
    const wrapper = mountGame()

    await wrapper.setProps({ disabled: true })

    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('hands the build camera on to the reveal', async () => {
    const wrapper = mountGame()
    const turned = { yaw: 2, pitch: -0.3, zoom: 1.7 }
    wrapper.getComponent(CopyBlocksBoard).vm.$emit('update:camera', turned)
    await nextTick()

    await wrapper.setProps({ myGuess: GUESS })

    expect(wrapper.getComponent(CopyBlocksReveal).props('camera')).toEqual(turned)
  })

  it('shows a closed round without a tip of mine as its reveal', () => {
    expect(mountGame({ closed: true }).findComponent(CopyBlocksReveal).exists()).toBe(true)
  })

  it('mounts the board under the cover while sealed', () => {
    const board = mountGame({ sealed: true, payload: null }).getComponent(CopyBlocksBoard)

    expect(board.props('sealed')).toBe(true)
  })

  it('says it cannot render a round without a payload', () => {
    expect(mountGame({ payload: { grid: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['copy-blocks']).toBeDefined()
    expect(labGameList).toContainEqual({ id: 'copy-blocks', title: 'Blockierung' })
  })
})
