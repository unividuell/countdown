import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import CopyBlocksBoard from '@/games/copyblocks/CopyBlocksBoard.vue'
import { loadDraft, saveDraft } from '@/games/copyblocks/draft'
import { playSound } from '@/games/copyblocks/sounds'
import type { CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'
import type { Hit } from '@/games/copyblocks/view'
import { START_CAMERA } from '@/games/copyblocks/view'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'
import { DEFAULT_HOLD_MS } from '@/ui/useHoldProgress'

vi.mock('@/games/copyblocks/sounds', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }))
vi.mock('@/games/copyblocks/textures', () => ({
  iconUrl: () => '',
  pickaxeIconUrl: () => 'data:pickaxe',
  blockMaterials: () => [],
}))

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(CopyBlocksBoard, {
    props: {
      payload: PAYLOAD,
      sealed: false,
      disabled: false,
      draftKey: null,
      awardRule: null,
      awardPoints: null,
      myColorHex: '#fde047',
      camera: START_CAMERA,
      ...over,
    },
    global: { stubs: { BlockScene: true } },
  })
}

type Board = ReturnType<typeof mountBoard>
const buildView = (w: Board) => w.findAllComponents(BlockScene)[0]!
const built = (w: Board) => buildView(w).props('blocks') as GuessBlock[]

async function tap(w: Board, hit: Hit) {
  buildView(w).vm.$emit('tap', hit)
  await nextTick()
}

async function choose(w: Board, label: string) {
  await w.get(`button[aria-label="${label}"]`).trigger('click')
}

describe('CopyBlocksBoard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(playSound).mockClear()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('puts the build field above the template and a hotbar of the round’s types plus the pickaxe', () => {
    const wrapper = mountBoard()
    const [build, template] = wrapper.findAllComponents(BlockScene)

    expect(build!.props('build')).toBe(true)
    expect(build!.props('blocks')).toEqual([])
    expect(template!.props('blocks')).toEqual(PAYLOAD.blocks)
    expect(
      wrapper.findAll('[data-test^="copy-blocks-slot-"]').map((s) => s.attributes('aria-label')),
    ).toEqual(['Erde', 'Ziegel', 'Laub', 'Spitzhacke'])
  })

  // Over the 3D view, like the tool buttons: dark glass in both modes. `inverse-surface` turned
  // light in the dark, and the white ring of the chosen slot vanished on it.
  it('lays the hotbar on dark glass in both modes', () => {
    const bar = mountBoard().get('[data-test="copy-blocks-slot-PICKAXE"]').element.parentElement!

    expect(bar.classList).toContain('bg-scrim/75')
    expect(bar.classList).not.toContain('bg-inverse-surface/75')
  })

  // As in Place Patch: the tip is the player's, so the button wears their colour. That colour
  // may be dark or light, so its edge takes the mode's ink and its label reads against the fill.
  it('submits from a button in the player’s colour', () => {
    const w = mountBoard()
    const button = w.getComponent(HoldButton)

    expect(button.props('color')).toBe('#fde047')
    expect(button.props('contour')).toBe('opposite')
    expect(w.get('[data-test="copy-blocks-submit-label"]').attributes('style')).toContain(
      'color: #111111',
    )
  })

  it('shows the pickaxe as a pixel picture, like the blocks', () => {
    const img = mountBoard().get('[data-test="copy-blocks-slot-PICKAXE"] img')

    expect(img.attributes('src')).toBe('data:pickaxe')
  })

  it('places the chosen type on the tapped face, with its sound', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, { block: null, place: [2, 0, 3] })
    await choose(wrapper, 'Ziegel')
    await tap(wrapper, { block: [2, 0, 3], place: [2, 1, 3] })

    expect(built(wrapper)).toEqual([
      { x: 2, y: 0, z: 3, type: 'DIRT' },
      { x: 2, y: 1, z: 3, type: 'BRICKS' },
    ])
    expect(vi.mocked(playSound).mock.calls).toEqual([
      ['place', 'DIRT'],
      ['place', 'BRICKS'],
    ])
  })

  it('breaks with the pickaxe only', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [2, 0, 3] })

    await choose(wrapper, 'Spitzhacke')
    await tap(wrapper, { block: [2, 0, 3], place: [2, 1, 3] })

    expect(built(wrapper)).toEqual([])
    expect(vi.mocked(playSound)).toHaveBeenLastCalledWith('break', 'DIRT')
  })

  it('undoes step by step', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [0, 0, 0] })
    await tap(wrapper, { block: null, place: [1, 0, 0] })

    await choose(wrapper, 'Rückgängig')
    expect(built(wrapper)).toEqual([{ x: 0, y: 0, z: 0, type: 'DIRT' }])
    await choose(wrapper, 'Rückgängig')
    expect(built(wrapper)).toEqual([])
  })

  it('sounds an undo like what it does: a block taken away breaks, one brought back is placed', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [0, 0, 0] })
    await choose(wrapper, 'Ziegel')
    await tap(wrapper, { block: [0, 0, 0], place: [0, 1, 0] })
    await choose(wrapper, 'Spitzhacke')
    await tap(wrapper, { block: [0, 0, 0], place: [0, 0, 1] })
    vi.mocked(playSound).mockClear()

    await choose(wrapper, 'Rückgängig')
    await choose(wrapper, 'Rückgängig')

    expect(vi.mocked(playSound).mock.calls).toEqual([
      ['place', 'DIRT'],
      ['break', 'BRICKS'],
    ])
  })

  it('keeps an undo silent while muted', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [0, 0, 0] })
    await choose(wrapper, 'Ton')
    vi.mocked(playSound).mockClear()

    await choose(wrapper, 'Rückgängig')

    expect(vi.mocked(playSound)).not.toHaveBeenCalled()
  })

  it('has no button that clears everything at once', () => {
    expect(mountBoard().find('button[aria-label="Alles abreißen"]').exists()).toBe(false)
  })

  it('refuses a block the server would refuse', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({
      x: i % 10,
      y: Math.floor(i / 10) % 10,
      z: Math.floor(i / 100),
      type: 'DIRT' as const,
    }))
    saveDraft(localStorage, 'k', full)
    const wrapper = mountBoard({ draftKey: 'k' })
    await nextTick()

    await tap(wrapper, { block: null, place: [5, 0, 5] })
    expect(built(wrapper)).toHaveLength(200)

    const empty = mountBoard()
    await tap(empty, { block: null, place: [65, 0, 0] })
    await tap(empty, { block: null, place: [0, -65, 0] })
    expect(built(empty)).toEqual([])
  })

  describe('while the submit hold runs', () => {
    const holdOf = (w: Board) => w.getComponent(HoldButton)
    const lock = (w: Board) => w.find('[data-test="copy-blocks-lock"]')
    const field = (w: Board) => w.get('[data-test="copy-blocks-field"]')

    async function progress(w: Board, value: number) {
      holdOf(w).vm.$emit('progress', value)
      await nextTick()
    }

    async function withABlock() {
      const wrapper = mountBoard()
      await tap(wrapper, { block: null, place: [0, 0, 0] })
      return wrapper
    }

    // As in Place Patch: the field greys and says what is happening, so the build cannot
    // change under a hold that is about to send it.
    it('greys the field and shows „Abgeben …“ while the ring rises', async () => {
      const wrapper = await withABlock()
      expect(lock(wrapper).exists()).toBe(false)

      await progress(wrapper, 0.4)
      expect(lock(wrapper).text()).toBe('Abgeben …')

      await progress(wrapper, 0.3)
      expect(lock(wrapper).exists()).toBe(false)
    })

    it('cancels the hold when a finger touches the field, and builds nothing then', async () => {
      const wrapper = await withABlock()
      await progress(wrapper, 0.4)

      await field(wrapper).trigger('pointerdown', { pointerId: 2 })
      expect(holdOf(wrapper).props('disabled')).toBe(true)
      await tap(wrapper, { block: null, place: [1, 0, 0] })
      await field(wrapper).trigger('pointerup', { pointerId: 2 })

      expect(built(wrapper)).toHaveLength(1)
      expect(holdOf(wrapper).props('disabled')).toBe(false)
    })

    it('drops the lock once submitted, so a guess that failed leaves the field playable', async () => {
      const wrapper = await withABlock()
      await progress(wrapper, 0.9)

      holdOf(wrapper).vm.$emit('confirm')
      await progress(wrapper, 1)

      expect(lock(wrapper).exists()).toBe(false)
      expect(wrapper.emitted('guess')).toHaveLength(1)
    })
  })

  it('submits the build on a full hold, never an empty one', async () => {
    const wrapper = mountBoard()
    const hold = () => wrapper.get('[data-test="hold-button"]')
    expect(hold().attributes('disabled')).toBeDefined()

    await tap(wrapper, { block: null, place: [2, 0, 3] })
    await hold().trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(DEFAULT_HOLD_MS + 100)

    expect(wrapper.emitted('guess')).toEqual([[{ blocks: [{ x: 2, y: 0, z: 3, type: 'DIRT' }] }]])
  })

  it('mutes, and the device remembers it', async () => {
    const wrapper = mountBoard()

    await choose(wrapper, 'Ton')
    await tap(wrapper, { block: null, place: [2, 0, 3] })

    expect(wrapper.get('button[aria-label="Ton"]').attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('copy-blocks:sound')).toBe('false')
    expect(vi.mocked(playSound)).not.toHaveBeenCalled()
  })

  it('restores a draft and saves every change', async () => {
    saveDraft(localStorage, 'k', [{ x: 1, y: 0, z: 1, type: 'LEAVES' }])
    const wrapper = mountBoard({ draftKey: 'k' })
    await nextTick()
    expect(built(wrapper)).toEqual([{ x: 1, y: 0, z: 1, type: 'LEAVES' }])

    await tap(wrapper, { block: null, place: [2, 0, 2] })

    expect(loadDraft(localStorage, 'k', PAYLOAD.types)).toHaveLength(2)
  })

  it('centres the field again, without turning it', async () => {
    const wrapper = mountBoard({ camera: { yaw: 2, pitch: -0.3, zoom: 0.4, target: [1, 2, 3] } })

    await choose(wrapper, 'Zentrieren')

    expect(wrapper.emitted('update:camera')).toEqual([
      [{ yaw: 2, pitch: -0.3, zoom: 1, target: null }],
    ])
  })

  it('centres the template too, on its own camera', async () => {
    const wrapper = mountBoard()
    const template = wrapper.findAllComponents(BlockScene)[1]!
    template.vm.$emit('update:camera', { yaw: 2, pitch: -0.3, zoom: 0.4, target: [1, 2, 3] })
    await nextTick()

    const [, centreTemplate] = wrapper.findAll('button[aria-label="Zentrieren"]')
    await centreTemplate!.trigger('click')

    expect(template.props('camera')).toEqual({ yaw: 2, pitch: -0.3, zoom: 1, target: null })
    expect(wrapper.emitted('update:camera')).toBeUndefined()
  })

  it('has nothing to centre at the start', () => {
    expect(mountBoard().get('button[aria-label="Zentrieren"]').attributes('disabled')).toBeDefined()
  })

  it('ignores taps while disabled', async () => {
    const wrapper = mountBoard({ disabled: true })

    await tap(wrapper, { block: null, place: [2, 0, 3] })

    expect(built(wrapper)).toEqual([])
  })

  it('shows no 3D view under the cover, and the cover reveals', async () => {
    const wrapper = mountBoard({ sealed: true, payload: null })

    expect(wrapper.findAllComponents(BlockScene)).toHaveLength(0)
    wrapper.findComponent(RevealCover).vm.$emit('start')

    expect(wrapper.emitted('reveal')).toHaveLength(1)
  })
})
