import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { loadDraft, saveDraft } from '@/games/turnpipes/draft'
import PipeGrid from '@/games/turnpipes/PipeGrid.vue'
import { playSound } from '@/games/turnpipes/sounds'
import TurnPipesBoard from '@/games/turnpipes/TurnPipesBoard.vue'
import type { PipeKindCode, TurnPipesPayload } from '@/games/turnpipes/types'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'

vi.mock('@/games/turnpipes/sounds', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }))

const SIZE = 6
const KINDS: PipeKindCode[] = Array.from({ length: SIZE * SIZE }, () => 'STRAIGHT')
KINDS[0] = 'INLET'
KINDS[1] = 'OUTLET'
const PAYLOAD: TurnPipesPayload = {
  size: SIZE,
  kinds: KINDS,
  start: Array.from({ length: SIZE * SIZE }, (_, i) => i % 4),
}

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(TurnPipesBoard, {
    props: {
      payload: PAYLOAD,
      scene: { size: SIZE },
      sealed: false,
      disabled: false,
      draftKey: null,
      awardRule: null,
      awardPoints: null,
      myColorHex: '#fde047',
      ...over,
    },
  })
}

type Board = ReturnType<typeof mountBoard>
const turnsOf = (w: Board) => w.getComponent(PipeGrid).props('turns') as number[]
const tile = (w: Board, cell: number) => w.findAll('button[aria-label^="Kachel"]')[cell]!

describe('TurnPipesBoard', () => {
  it('the grid bleeds card-wide, without w-full on the bleeding box', () => {
    const box = mountBoard().getComponent(PipeGrid).element.closest('.-mx-4')!

    expect(box).not.toBeNull()
    expect(box.classList).toContain('-mt-4')
    expect(box.classList).not.toContain('w-full')
  })

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(playSound).mockClear()
  })

  afterEach(() => vi.restoreAllMocks())

  it('a tap turns that tile a quarter, and three quick taps are three quarters', async () => {
    const wrapper = mountBoard({ payload: { ...PAYLOAD, start: PAYLOAD.start.map(() => 0) } })

    await tile(wrapper, 5).trigger('click')
    expect(turnsOf(wrapper)[5]).toBe(1)

    await tile(wrapper, 9).trigger('click')
    await tile(wrapper, 9).trigger('click')
    await tile(wrapper, 9).trigger('click')
    expect(turnsOf(wrapper)[9]).toBe(3)
    expect(turnsOf(wrapper)[5]).toBe(1)
  })

  it('a tap clicks when sound is on, and is silent when muted', async () => {
    const wrapper = mountBoard()

    await tile(wrapper, 2).trigger('click')
    expect(vi.mocked(playSound).mock.calls).toEqual([['turn']])

    await wrapper.get('button[aria-label="Ton"]').trigger('click')
    await tile(wrapper, 2).trigger('click')
    expect(vi.mocked(playSound)).toHaveBeenCalledTimes(1)
  })

  it('holding submits every rotation', async () => {
    const wrapper = mountBoard()
    await tile(wrapper, 0).trigger('click')

    wrapper.getComponent(HoldButton).vm.$emit('confirm')

    const [[guess]] = wrapper.emitted('guess') as [[{ rotations: number[] }]]
    expect(guess.rotations).toHaveLength(SIZE * SIZE)
    expect(guess.rotations.every((r) => r >= 0 && r <= 3)).toBe(true)
    expect(guess.rotations[0]).toBe(1)
  })

  it('a finger on the board keeps the hold off and turns nothing while it locks', async () => {
    const wrapper = mountBoard({ payload: { ...PAYLOAD, start: PAYLOAD.start.map(() => 0) } })
    const hold = wrapper.getComponent(HoldButton)
    hold.vm.$emit('progress', 0.4)
    await nextTick()
    expect(wrapper.find('[data-test="turn-pipes-lock"]').exists()).toBe(true)

    await wrapper.get('[data-test="turn-pipes-field"]').trigger('pointerdown', { pointerId: 2 })
    expect(hold.props('disabled')).toBe(true)
    await tile(wrapper, 4).trigger('click')
    await wrapper.get('[data-test="turn-pipes-field"]').trigger('pointerup', { pointerId: 2 })

    expect(turnsOf(wrapper)[4]).toBe(0)
    expect(hold.props('disabled')).toBe(false)
  })

  it('the draft is restored, saved after a tap, and a broken one falls back to the start', async () => {
    const saved = PAYLOAD.start.map(() => 2)
    saveDraft(localStorage, 'k', saved)
    const restored = mountBoard({ draftKey: 'k' })
    expect(turnsOf(restored)).toEqual(saved)

    await tile(restored, 0).trigger('click')
    expect(loadDraft(localStorage, 'k', SIZE)![0]).toBe(3)

    localStorage.setItem('k2', '{broken')
    expect(turnsOf(mountBoard({ draftKey: 'k2' }))).toEqual(PAYLOAD.start)
  })

  it('sealed shows the cover over size² empty plates', () => {
    const wrapper = mountBoard({ sealed: true, payload: null, scene: { size: 7 } })

    expect(wrapper.findAll('button[aria-label^="Kachel"]')).toHaveLength(49)
    expect(wrapper.findAll('button[aria-label^="Kachel"] img')).toHaveLength(49)
    wrapper.findComponent(RevealCover).vm.$emit('start')
    expect(wrapper.emitted('reveal')).toHaveLength(1)
  })
})
