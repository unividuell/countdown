import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { draftKey, loadDraft, saveDraft } from '@/games/matchscale/draft'
import { baseCellPx, FIELD_PX, type View } from '@/games/matchscale/gestures'
import MatchScaleBoard from '@/games/matchscale/MatchScaleBoard.vue'
import ScaleField from '@/games/matchscale/ScaleField.vue'
import type { MatchScalePayload } from '@/games/matchscale/types'
import HoldButton from '@/ui/HoldButton.vue'

enableAutoUnmount(afterEach)

const PAYLOAD: MatchScalePayload = {
  categoryName: 'Formen',
  a: { name: 'Alpha', path: 'M0 0H1000V500H0Z', width: 1000, height: 500, attribution: null },
  b: { name: 'Beta', path: 'M0 0H600V1000H0Z', width: 600, height: 1000, attribution: null },
  toleranceFactor: 1.1,
}
const MINE = '#7c3aed'

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(MatchScaleBoard, {
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
  beforeEach(() => localStorage.clear())

  it('names A and B outside the field, each in its colour', () => {
    const wrapper = mountBoard()
    const field = wrapper.get('[data-test="match-scale-field"]').element

    const a = wrapper.get<HTMLElement>('[data-test="match-scale-label-a"]')
    const b = wrapper.get<HTMLElement>('[data-test="match-scale-label-b"]')
    expect(a.text()).toBe('Alpha')
    expect(b.text()).toBe('Beta')
    expect(a.element.style.color).toBe('var(--color-on-surface-variant)')
    expect(b.element.style.color).toBe('var(--color-amber-200)')
    expect(field.contains(a.element) || field.contains(b.element)).toBe(false)

    const scale = wrapper.getComponent(ScaleField)
    expect(scale.props('aColor')).toBe('var(--color-on-surface-variant)')
    expect(scale.props('bColor')).toBe('var(--color-amber-200)')
  })

  it('holding submits the scale B has now', async () => {
    const wrapper = mountBoard()
    const field = wrapper.getComponent(ScaleField)
    field.vm.$emit('update:placementB', { x: 3, y: 1, scale: 1.7 })
    await nextTick()

    wrapper.getComponent(HoldButton).vm.$emit('confirm')

    expect(wrapper.emitted('guess')).toEqual([[{ scale: 1.7 }]])
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
