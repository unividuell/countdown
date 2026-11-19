import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { FIELD_PX, initialPlacements, initialView, type View } from '@/games/matchscale/gestures'
import ScaleField from '@/games/matchscale/ScaleField.vue'
import type { Silhouette } from '@/games/matchscale/types'

enableAutoUnmount(afterEach)

const A: Silhouette = {
  name: 'Alpha',
  path: 'M0 0H1000V500H0Z',
  width: 1000,
  height: 500,
  attribution: null,
}
const B: Silhouette = {
  name: 'Beta',
  path: 'M0 0H600V1000H0Z',
  width: 600,
  height: 1000,
  attribution: null,
}
const START = initialPlacements(A)

// At 360 px and zoom 1 a cell is 40 px, and the ground line lies at y = 280. B stands at x 5..6.8,
// y 0..3 in the world: on screen x 200..272, y 160..280, its handle centred on (272, 160).
const ON_B = { clientX: 236, clientY: 220 }
const ON_HANDLE = { clientX: 272, clientY: 160 }
const EMPTY = { clientX: 60, clientY: 60 }

function mountField(over: Record<string, unknown> = {}) {
  const wrapper = mount(ScaleField, {
    props: {
      a: A,
      b: B,
      aColor: 'var(--color-on-surface-variant)',
      bColor: '#7c3aed',
      view: initialView(FIELD_PX),
      placementA: START.a,
      placementB: START.b,
      outlines: [],
      interactive: true,
      ...over,
    },
  })

  const svg = wrapper.get('svg')
  vi.spyOn(svg.element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 360,
    height: 360,
    right: 360,
    bottom: 360,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)

  return { wrapper, svg }
}

type Field = ReturnType<typeof mountField>

async function pointer(field: Field, type: string, id: number, at: object) {
  await field.svg.trigger(type, { pointerId: id, button: 0, ...at })
}

describe('ScaleField', () => {
  it('draws the grid, the ground line and A under B', () => {
    const { wrapper } = mountField()

    expect(wrapper.findAll('[data-test="match-scale-grid"] line').length).toBeGreaterThan(0)
    expect(wrapper.get('[data-test="match-scale-ground"]').attributes('y1')).toBe('280')

    const a = wrapper.get('[data-test="match-scale-a"]').element
    const b = wrapper.get('[data-test="match-scale-b"]').element
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names both silhouettes for a screen reader', () => {
    const { svg } = mountField()

    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Spielfeld mit Alpha und Beta')
  })

  it('takes every touch itself, so the page neither scrolls nor zooms', () => {
    expect(mountField().svg.classes()).toContain('touch-none')
  })

  it('puts a 44 px handle on B’s top right corner', () => {
    const handle = mountField().wrapper.get<HTMLElement>('[aria-label="Größe ändern"]')

    expect(handle.classes()).toContain('size-11')
    expect(handle.element.style.left).toBe(`${(272 / 360) * 100}%`)
    expect(handle.element.style.top).toBe(`${(160 / 360) * 100}%`)
  })

  it('draws no handle when it takes no input', () => {
    const { wrapper } = mountField({ interactive: false })

    expect(wrapper.find('[aria-label="Größe ändern"]').exists()).toBe(false)
  })

  it('draws an outline of B at its placement, dashed if asked', () => {
    const { wrapper } = mountField({
      outlines: [{ placement: { x: 1, y: 0, scale: 2 }, color: '#ff0000', dashed: true }],
    })

    const outline = wrapper.get('[data-test="match-scale-outline"]')
    expect(outline.attributes('d')).toBe(B.path)
    expect(outline.attributes('stroke')).toBe('#ff0000')
    expect(outline.attributes('stroke-dasharray')).toBeDefined()
  })

  it('keeps the handle while locked, inert, and takes no input', async () => {
    const field = mountField({ locked: true })

    const handle = field.wrapper.get('[aria-label="Größe ändern"]')
    expect(handle.attributes('inert')).toBeDefined()

    await pointer(field, 'pointerdown', 1, ON_B)
    await pointer(field, 'pointermove', 1, { clientX: 276, clientY: 180 })
    await field.svg.trigger('wheel', { deltaY: -300, clientX: 180, clientY: 180 })

    expect(field.wrapper.emitted('update:placementB')).toBeUndefined()
    expect(field.wrapper.emitted('update:view')).toBeUndefined()
  })

  it('a finger on B moves it, keeping its scale', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_B)
    await pointer(field, 'pointermove', 1, { clientX: 276, clientY: 180 })
    await pointer(field, 'pointerup', 1, { clientX: 276, clientY: 180 })

    const moves = field.wrapper.emitted('update:placementB')!
    expect(moves.at(-1)).toEqual([{ x: 6, y: 1, scale: 1 }])
    expect(field.wrapper.emitted('update:view')).toBeUndefined()
  })

  it('a finger on the handle scales B, its bottom left corner fixed', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_HANDLE)
    await pointer(field, 'pointermove', 1, { clientX: 308, clientY: 100 })
    await pointer(field, 'pointerup', 1, { clientX: 308, clientY: 100 })

    const [placement] = field.wrapper.emitted('update:placementB')!.at(-1) as [
      { x: number; y: number; scale: number },
    ]
    expect(placement.scale).toBeCloseTo(1.5)
    expect(placement.x).toBe(START.b.x)
    expect(placement.y).toBe(START.b.y)
  })

  it('a finger on the empty field pans the view', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, EMPTY)
    await pointer(field, 'pointermove', 1, { clientX: 80, clientY: 90 })

    const [view] = field.wrapper.emitted('update:view')!.at(-1) as [View]
    expect(view.left).toBeCloseTo(-0.5)
    expect(view.top).toBeCloseTo(7.75)
    expect(view.cellPx).toBe(40)
    expect(field.wrapper.emitted('update:placementB')).toBeUndefined()
  })

  it('two fingers zoom, even when the first one came down on B', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_B)
    await pointer(field, 'pointerdown', 2, EMPTY)
    await pointer(field, 'pointermove', 2, { clientX: 20, clientY: 20 })
    await pointer(field, 'pointermove', 1, { clientX: 250, clientY: 240 })

    const [view] = field.wrapper.emitted('update:view')!.at(-1) as [View]
    expect(view.cellPx).toBeGreaterThan(40)
    expect(field.wrapper.emitted('update:placementB')).toBeUndefined()
  })

  it('a second finger ends a running move where it is', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_B)
    await pointer(field, 'pointermove', 1, { clientX: 276, clientY: 220 })
    await pointer(field, 'pointerdown', 2, EMPTY)
    await pointer(field, 'pointermove', 1, { clientX: 300, clientY: 220 })
    await pointer(field, 'pointerup', 2, EMPTY)
    await pointer(field, 'pointermove', 1, { clientX: 320, clientY: 220 })

    expect(field.wrapper.emitted('update:placementB')).toEqual([[{ x: 6, y: 0, scale: 1 }]])
  })

  it('a pinch picks up where the finger left behind has slid to', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, EMPTY)
    await pointer(field, 'pointerdown', 2, { clientX: 300, clientY: 300 })
    await pointer(field, 'pointerup', 2, { clientX: 300, clientY: 300 })
    await pointer(field, 'pointermove', 1, { clientX: 150, clientY: 150 })
    await pointer(field, 'pointerdown', 2, { clientX: 300, clientY: 300 })
    await pointer(field, 'pointermove', 1, { clientX: 150, clientY: 150 })

    expect(field.wrapper.emitted('update:view')!.at(-1)).toEqual([initialView(FIELD_PX)])
  })

  it('pointercancel ends a gesture', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_B)
    await pointer(field, 'pointermove', 1, { clientX: 276, clientY: 220 })
    await pointer(field, 'pointercancel', 1, { clientX: 276, clientY: 220 })
    await pointer(field, 'pointermove', 1, { clientX: 316, clientY: 220 })

    expect(field.wrapper.emitted('update:placementB')).toEqual([[{ x: 6, y: 0, scale: 1 }]])
  })

  it('the wheel zooms around the pointer', async () => {
    const field = mountField()

    await field.svg.trigger('wheel', { deltaY: -300, clientX: 180, clientY: 180 })

    const [view] = field.wrapper.emitted('update:view')!.at(-1) as [View]
    expect(view.cellPx).toBeCloseTo(80)
    expect(view.left).toBeCloseTo(2.25)
  })

  it('takes no input when it is not interactive', async () => {
    const field = mountField({ interactive: false })

    for (const at of [ON_B, ON_HANDLE, EMPTY]) {
      await pointer(field, 'pointerdown', 1, at)
      await pointer(field, 'pointermove', 1, { clientX: 100, clientY: 100 })
      await pointer(field, 'pointerup', 1, { clientX: 100, clientY: 100 })
    }
    await field.svg.trigger('wheel', { deltaY: -300, clientX: 180, clientY: 180 })

    expect(field.wrapper.emitted('update:view')).toBeUndefined()
    expect(field.wrapper.emitted('update:placementB')).toBeUndefined()
  })
})
