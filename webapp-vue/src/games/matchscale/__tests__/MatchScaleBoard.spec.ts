import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { draftKey, loadDraft, saveDraft } from '@/games/matchscale/draft'
import { baseCellPx, FIELD_PX, type View } from '@/games/matchscale/gestures'
import MatchScaleBoard from '@/games/matchscale/MatchScaleBoard.vue'
import MatchScaleLegend from '@/games/matchscale/MatchScaleLegend.vue'
import ScaleField from '@/games/matchscale/ScaleField.vue'
import type { MatchScalePayload } from '@/games/matchscale/types'
import { playPop } from '@/games/matchscale/countSound'
import HoldButton from '@/ui/HoldButton.vue'
import { CURTAIN_KEY } from '@/ui/curtain'
import { soundOnStage } from '@/ui/useSoundAwake'

const stopPop = vi.fn()
vi.mock('@/games/matchscale/countSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/matchscale/countSound')>()),
  playPop: vi.fn(() => ({ stop: stopPop })),
}))

enableAutoUnmount(afterEach)

const PAYLOAD: MatchScalePayload = {
  categoryName: 'Formen',
  categoryLegend: null,
  a: { name: 'Alpha', path: 'M0 0H1000V500H0Z', width: 1000, height: 500, attribution: null },
  b: { name: 'Beta', path: 'M0 0H600V1000H0Z', width: 600, height: 1000, attribution: null },
  tolerance: 0.1,
}
const MINE = '#7c3aed'

function mountBoard(over: Record<string, unknown> = {}, curtain?: { value: boolean }) {
  return mount(MatchScaleBoard, {
    global: curtain ? { provide: { [CURTAIN_KEY as symbol]: curtain } } : {},
    props: {
      payload: PAYLOAD,
      disabled: false,
      draftKey: null,
      awardRule: null,
      awardPoints: null,
      myColorHex: MINE,
      ...over,
    },
  })
}

describe('MatchScaleBoard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('holds the pop and its knocks while the curtain is closed, then plays them once', async () => {
    const curtain = ref(false)
    const wrapper = mountBoard({}, curtain)

    expect(playPop).not.toHaveBeenCalled()
    expect(wrapper.getComponent(ScaleField).props('popHeld')).toBe(true)

    curtain.value = true
    await nextTick()

    expect(playPop).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(ScaleField).props('popHeld')).toBe(false)

    curtain.value = false
    await nextTick()
    curtain.value = true
    await nextTick()

    expect(playPop).toHaveBeenCalledTimes(1)
  })

  it('knocks at mount when the curtain is already open', () => {
    const wrapper = mountBoard({}, ref(true))

    expect(playPop).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(ScaleField).props('popHeld')).toBe(false)
  })

  it("marks both names with the category's legend, one footnote", () => {
    const wrapper = mountBoard({ payload: { ...PAYLOAD, categoryLegend: 'Wie gezeichnet.' } })
    const markers = wrapper.findAll('[data-test="match-scale-marker"]').map((sup) => sup.text())

    expect(markers).toEqual(['1', '1'])
    expect(wrapper.get('[data-test="match-scale-footnotes"]').text()).toBe('1 Wie gezeichnet.')
  })

  it('names A and B under the field, each in its colour, with no measure', () => {
    const wrapper = mountBoard()
    const field = wrapper.get('[data-test="match-scale-field"]').element
    const legend = wrapper.getComponent(MatchScaleLegend)

    expect(
      field.compareDocumentPosition(legend.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(legend.props()).toMatchObject({
      a: PAYLOAD.a,
      b: PAYLOAD.b,
      aColor: 'var(--color-on-surface-variant)',
      bColor: 'var(--color-match-scale-b)',
      measureA: null,
      measureB: null,
    })

    const scale = wrapper.getComponent(ScaleField)
    expect(scale.props('aColor')).toBe('var(--color-on-surface-variant)')
    expect(scale.props('bColor')).toBe('var(--color-match-scale-b)')
  })

  it('holding submits the scale B has now', async () => {
    const wrapper = mountBoard()
    const field = wrapper.getComponent(ScaleField)
    field.vm.$emit('update:placementB', { x: 3, y: 1, scale: 1.7 })
    await nextTick()

    wrapper.getComponent(HoldButton).vm.$emit('confirm')

    expect(wrapper.emitted('guess')).toEqual([
      [{ scale: 1.7 }, { view: expect.any(Object), b: { x: 3, y: 1, scale: 1.7 } }],
    ])
    expect(wrapper.getComponent(HoldButton).props('label')).toBe('Größe abgeben — gedrückt halten')
  })

  it('a rising hold locks the field', async () => {
    const wrapper = mountBoard()
    expect(wrapper.getComponent(ScaleField).props('interactive')).toBe(true)

    wrapper.getComponent(HoldButton).vm.$emit('progress', 0.4)
    await nextTick()

    expect(wrapper.find('[data-test="match-scale-lock"]').exists()).toBe(true)
    expect(wrapper.getComponent(ScaleField).props('interactive')).toBe(true)
    expect(wrapper.getComponent(ScaleField).props('locked')).toBe(true)
  })

  it('opens with A and B popping up, knocking', async () => {
    const wrapper = mountBoard()

    expect(wrapper.getComponent(ScaleField).props('popIn')).toBe(true)
    expect(playPop).toHaveBeenCalledOnce()
  })

  it('cuts the knocks on leaving', () => {
    mountBoard().unmount()

    expect(stopPop).toHaveBeenCalledOnce()
  })

  it('leaves the sound switch to the header, and asks it to wake the graph while here', () => {
    expect(mountBoard().find('button[aria-label="Ton"]').exists()).toBe(false)
    expect(soundOnStage.value).toBe(true)
  })

  it('a finger on the field keeps the hold off', async () => {
    const wrapper = mountBoard()
    const hold = wrapper.getComponent(HoldButton)

    await wrapper.get('[data-test="match-scale-field"]').trigger('pointerdown', { pointerId: 3 })
    expect(hold.props('disabled')).toBe(true)

    await wrapper.get('[data-test="match-scale-field"]').trigger('pointerup', { pointerId: 3 })
    expect(hold.props('disabled')).toBe(false)
  })

  it('takes no input while disabled', () => {
    const wrapper = mountBoard({ disabled: true })

    expect(wrapper.getComponent(ScaleField).props('interactive')).toBe(false)
    expect(wrapper.getComponent(HoldButton).props('disabled')).toBe(true)
  })

  it('saves B and the view when the gesture ends, and starts from them on mount', async () => {
    const wrapper = mountBoard({ draftKey: 'k' })
    const field = wrapper.getComponent(ScaleField)
    const zoomed: View = { left: 2, top: 6, cellPx: baseCellPx(FIELD_PX) * 2 }

    field.vm.$emit('update:placementB', { x: 3, y: 1, scale: 1.7 })
    field.vm.$emit('update:view', zoomed)
    await nextTick()
    expect(loadDraft(localStorage, 'k')).toBeNull()

    await wrapper.get('[data-test="match-scale-field"]').trigger('pointerup', { pointerId: 1 })

    const saved = loadDraft(localStorage, 'k')!
    expect(saved.b).toEqual({ x: 3, y: 1, scale: 1.7 })
    expect(saved.zoom).toBeCloseTo(2)

    const restored = mountBoard({ draftKey: 'k' }).getComponent(ScaleField)
    expect(restored.props('placementB')).toEqual({ x: 3, y: 1, scale: 1.7 })
    expect(restored.props('view').cellPx).toBeCloseTo(zoomed.cellPx)
    expect(restored.props('view').left).toBeCloseTo(2)
    expect(restored.props('view').top).toBeCloseTo(6)
  })

  it.each(['pointercancel', 'wheel'])('saves on %s too', async (type) => {
    const wrapper = mountBoard({ draftKey: 'k' })
    wrapper.getComponent(ScaleField).vm.$emit('update:placementB', { x: 3, y: 1, scale: 1.7 })

    await wrapper.get('[data-test="match-scale-field"]').trigger(type, { pointerId: 1 })

    expect(loadDraft(localStorage, 'k')!.b).toEqual({ x: 3, y: 1, scale: 1.7 })
  })

  it("opening a round sweeps the player's stale drafts of other rounds", () => {
    const key = draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })
    const other = { ...PAYLOAD, b: { ...PAYLOAD.b, path: 'M0 0H10V10Z' } }
    const stale = draftKey({ userId: 'u1', payload: other, timed: false })
    const draft = { v: 1, b: { x: 0, y: 0, scale: 3 }, zoom: 1, centre: { x: 0, y: 0 } } as const
    saveDraft(localStorage, stale, draft, Date.now() - 49 * 60 * 60 * 1000)

    mountBoard({ draftKey: key })

    expect(localStorage.getItem(stale)).toBeNull()
  })

  it('starts from the start placements without a draft', () => {
    saveDraft(localStorage, 'other', {
      v: 1,
      b: { x: 0, y: 0, scale: 3 },
      zoom: 1,
      centre: { x: 0, y: 0 },
    })

    const field = mountBoard({ draftKey: 'k' }).getComponent(ScaleField)

    expect(field.props('placementA')).toEqual({ x: 1, y: 0, scale: 1 })
    expect(field.props('placementB')).toEqual({ x: 5, y: 0, scale: 1 })
    expect(field.props('view')).toEqual({ left: 0, top: 7, cellPx: 40 })
  })
})
