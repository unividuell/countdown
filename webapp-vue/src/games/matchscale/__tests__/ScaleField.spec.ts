import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { FIELD_PX, initialPlacements, initialView, type View } from '@/games/matchscale/gestures'
import ScaleField from '@/games/matchscale/ScaleField.vue'
import type { Silhouette } from '@/games/matchscale/types'
import { POP_GAP_MS, POP_MS } from '@/games/matchscale/countSound'
import { soundOnStage } from '@/ui/useSoundAwake'

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
// y 0..3 in the world: on screen x 200..272, y 160..280, its top right corner at (272, 160) and
// the handle 14 px up and right of it, centred on (286, 146).
const ON_B = { clientX: 236, clientY: 220 }
const ON_CORNER = { clientX: 272, clientY: 160 }
const ON_HANDLE = { clientX: 286, clientY: 146 }
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
  it('asks the header to wake the graph while it is here, in play and in the reveal', () => {
    const { wrapper } = mountField()

    expect(soundOnStage.value).toBe(true)

    wrapper.unmount()
    expect(soundOnStage.value).toBe(false)
  })

  it('eases B only with grow: CSS transform and transition class', () => {
    const grown = mountField({ grow: true }).wrapper.get('[data-test="match-scale-b"]')
    const plain = mountField().wrapper.get('[data-test="match-scale-b"]')

    expect(grown.attributes('style')).toContain('transform: translate(')
    expect(grown.classes()).toContain('transition-[transform,opacity]')
    expect(plain.attributes('style') ?? '').not.toContain('transform')
    expect(plain.classes()).not.toContain('transition-[transform,opacity]')
  })

  it("times B's growth as told: the count's span and easing", () => {
    const grown = mountField({
      grow: true,
      growTiming: { ms: 1213, easing: 'linear(0 0%, 0.5 25%, 1 100%)' },
    }).wrapper.get<SVGElement>('[data-test="match-scale-b"]')

    expect(grown.element.style.transitionDuration).toBe('1213ms')
    expect(grown.element.style.transitionTimingFunction).toBe('linear(0 0%, 0.5 25%, 1 100%)')
  })

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

  it('puts a 32 px handle just outside B’s top right corner', () => {
    const handle = mountField().wrapper.get<HTMLElement>('[aria-label="Größe ändern"]')

    expect(handle.classes()).toEqual(
      expect.arrayContaining(['h-8', 'w-8', 'rounded-full', 'bg-inverse-surface']),
    )
    expect(handle.find('svg').exists()).toBe(true)
    // 14·√2 ≈ 20 > 16: the circle ends beyond the corner and covers nothing of B's box.
    expect(handle.element.style.left).toBe(`calc(${(272 / 360) * 100}% + 14px)`)
    expect(handle.element.style.top).toBe(`calc(${(160 / 360) * 100}% - 14px)`)
  })

  it('draws no handle when it takes no input', () => {
    const { wrapper } = mountField({ interactive: false })

    expect(wrapper.find('[aria-label="Größe ändern"]').exists()).toBe(false)
  })

  it('draws an outline of B at its placement, dashed if asked', () => {
    const { wrapper } = mountField({
      outlines: [{ placement: { x: 1, y: 0, scale: 2 }, color: '#ff0000', dashed: true }],
    })

    const outline = wrapper.get<SVGPathElement>('[data-test="match-scale-outline"]')
    expect(outline.attributes('d')).toBe(B.path)
    expect(outline.element.style.stroke).toBe('#ff0000')
    expect(outline.element.style.strokeOpacity).toBe('1')
    expect(outline.element.style.fillOpacity).toBe('0')
    expect(outline.attributes('stroke-dasharray')).toBeDefined()
  })

  it('draws a filled outline as a solid shape, and eases one that asks', () => {
    const { wrapper } = mountField({
      outlines: [
        { placement: { x: 1, y: 0, scale: 2 }, color: '#ff0000', dashed: true, filled: true },
        { placement: { x: 1, y: 0, scale: 2 }, color: '#ff0000', dashed: true, eased: true },
      ],
    })
    const [filled, eased] = wrapper.findAll<SVGPathElement>('[data-test="match-scale-outline"]')

    expect(filled!.element.style.fill).toBe('#ff0000')
    expect(filled!.element.style.fillOpacity).toBe('1')
    expect(filled!.element.style.strokeOpacity).toBe('0')
    expect(filled!.classes()).toHaveLength(0)
    expect(eased!.element.style.transform).toContain('translate(')
    expect(eased!.classes()).toContain(
      'transition-[transform,fill,fill-opacity,stroke,stroke-opacity]',
    )
  })

  it('pops A, then B and its handle `POP_GAP_MS` later, only when asked', () => {
    const popping = mountField({ popIn: true }).wrapper
    const groupOf = (id: string) => popping.get(`[data-test="${id}"]`).element.parentElement!

    expect(groupOf('match-scale-a').classList).toContain('pop-in')
    expect(groupOf('match-scale-a').style.animationDelay).toBe('0ms')
    expect(groupOf('match-scale-b').style.animationDelay).toBe(`${POP_GAP_MS}ms`)
    expect(groupOf('match-scale-b').style.animationDuration).toBe(`${POP_MS}ms`)
    expect(popping.get('[aria-label="Größe ändern"]').classes()).toContain('pop-in-handle')

    const still = mountField().wrapper
    expect(still.find('.pop-in').exists()).toBe(false)
    expect(still.find('.pop-in-handle').exists()).toBe(false)
  })

  it('hides B on request', () => {
    const b = mountField({ bHidden: true }).wrapper.get<SVGPathElement>(
      '[data-test="match-scale-b"]',
    )

    expect(b.element.style.opacity).toBe('0')
  })

  it('a camera draws the field as `from` showed it, then eases into the view', async () => {
    const view = initialView(FIELD_PX)
    // Zoomed in twice around the field's centre: the world point at the old (180, 180) stays.
    const from: View = { left: view.left + 2.25, top: view.top - 2.25, cellPx: 80 }
    const field = mountField({ view, camera: { from, moved: false } })
    const camera = () => field.wrapper.get<SVGGElement>('[data-test="match-scale-camera"]')
    const grid = () => field.wrapper.get<SVGGElement>('[data-test="match-scale-grid"]')
    const fromGrid = () => field.wrapper.find<SVGGElement>('[data-test="match-scale-grid-from"]')

    expect(camera().element.style.transform).toBe('translate(-180px, -180px) scale(2)')
    expect(camera().classes()).toContain('transition-transform')
    expect(grid().element.style.opacity).toBe('0')
    expect(fromGrid().element.style.opacity).toBe('1')

    await field.wrapper.setProps({ camera: { from, moved: true } })

    expect(camera().element.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(grid().element.style.opacity).toBe('1')
    expect(fromGrid().element.style.opacity).toBe('0')

    await field.wrapper.setProps({ camera: null })

    expect(camera().attributes('style') ?? '').not.toContain('transform')
    expect(camera().classes()).toHaveLength(0)
    expect(fromGrid().exists()).toBe(false)
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

    // The corner follows the finger at the offset it was grabbed with: to (308, 100).
    await pointer(field, 'pointerdown', 1, ON_HANDLE)
    await pointer(field, 'pointermove', 1, { clientX: 322, clientY: 86 })
    await pointer(field, 'pointerup', 1, { clientX: 322, clientY: 86 })

    const [placement] = field.wrapper.emitted('update:placementB')!.at(-1) as [
      { x: number; y: number; scale: number },
    ]
    expect(placement.scale).toBeCloseTo(1.5)
    expect(placement.x).toBe(START.b.x)
    expect(placement.y).toBe(START.b.y)
  })

  it('grabbing the handle leaves B as it is until the finger moves', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_HANDLE)
    await pointer(field, 'pointermove', 1, ON_HANDLE)

    const [placement] = field.wrapper.emitted('update:placementB')!.at(-1) as [
      { x: number; y: number; scale: number },
    ]
    expect(placement.scale).toBeCloseTo(1)
  })

  it('a finger on B’s corner moves B: the handle is not there', async () => {
    const field = mountField()

    await pointer(field, 'pointerdown', 1, ON_CORNER)
    await pointer(field, 'pointermove', 1, { clientX: 312, clientY: 160 })

    expect(field.wrapper.emitted('update:placementB')!.at(-1)).toEqual([{ x: 6, y: 0, scale: 1 }])
  })

  it('the handle catches a finger within its 16 px radius only', async () => {
    const near = mountField()
    await pointer(near, 'pointerdown', 1, { clientX: 298, clientY: 146 })
    await pointer(near, 'pointermove', 1, { clientX: 314, clientY: 126 })

    const far = mountField()
    await pointer(far, 'pointerdown', 1, { clientX: 304, clientY: 146 })
    await pointer(far, 'pointermove', 1, { clientX: 314, clientY: 126 })

    expect(near.wrapper.emitted('update:placementB')).toBeDefined()
    expect(far.wrapper.emitted('update:placementB')).toBeUndefined()
    expect(far.wrapper.emitted('update:view')).toBeDefined()
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
