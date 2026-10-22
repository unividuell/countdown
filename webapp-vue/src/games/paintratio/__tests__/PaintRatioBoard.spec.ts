import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LayerCanvas from '@/games/paintratio/LayerCanvas.vue'
import PaintRatioBoard from '@/games/paintratio/PaintRatioBoard.vue'
import { loadDraft, saveDraft } from '@/games/paintratio/draft'
import { MAX_POINTS } from '@/games/paintratio/types'
import type { PaintRatioPayload, Stroke } from '@/games/paintratio/types'
import HoldButton from '@/ui/HoldButton.vue'

/** A `Storage` over a map, handed to the board through `deviceStorage`. */
const storage = vi.hoisted(() => {
  const items = new Map<string, string>()

  return {
    items,
    fake: {
      get length() {
        return items.size
      },
      key: (i: number) => [...items.keys()][i] ?? null,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      clear: () => items.clear(),
    } as Storage,
  }
})

vi.mock('@/games/drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/drafts')>()),
  deviceStorage: () => storage.fake,
}))

enableAutoUnmount(afterEach)

const PAYLOAD: PaintRatioPayload = {
  width: 1200,
  height: 900,
  brushes: [40, 80, 160],
  tolerance: 0.05,
}
const KEY = 'paint-ratio:draft:u1:0000abcd'

function rect(width: number, height: number): DOMRect {
  return {
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }
}

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(PaintRatioBoard, {
    props: {
      payload: PAYLOAD,
      templateSrc: 'blob:template',
      pictureFailed: false,
      myColorHex: '#3049E8',
      draftKey: null,
      disabled: false,
      awardRule: null,
      awardPoints: null,
      ...over,
    },
    global: { stubs: { HoldButton: true } },
  })
}

type Board = ReturnType<typeof mountBoard>
type Point = [x: number, y: number]

const canvas = (w: Board) => w.get('[data-test="paint-ratio-canvas"]')
const hold = (w: Board) => w.findComponent(HoldButton)
const layers = (w: Board) => w.findComponent(LayerCanvas).props('layers')
const lock = (w: Board) => w.find('[data-test="paint-ratio-lock"]')
const button = (w: Board, label: string) => w.get(`button[aria-label="${label}"]`)

async function down(w: Board, pointerId: number, [clientX, clientY]: Point, isPrimary = true) {
  await canvas(w).trigger('pointerdown', { pointerId, clientX, clientY, button: 0, isPrimary })
}

async function move(w: Board, pointerId: number, [clientX, clientY]: Point) {
  await canvas(w).trigger('pointermove', { pointerId, clientX, clientY })
}

async function up(w: Board, pointerId: number) {
  await canvas(w).trigger('pointerup', { pointerId })
}

/** One finger, down at the first point, through the rest, and up. */
async function paint(w: Board, pointerId: number, ...[first, ...rest]: [Point, ...Point[]]) {
  await down(w, pointerId, first)
  for (const point of rest) await move(w, pointerId, point)
  await up(w, pointerId)
}

async function progress(w: Board, value: number) {
  hold(w).vm.$emit('progress', value)
  await nextTick()
}

async function confirm(w: Board) {
  hold(w).vm.$emit('confirm')
  await nextTick()
}

function painted(w: Board): Stroke[] {
  const [layer] = layers(w)
  return layer?.kind === 'strokes' ? [...layer.strokes] : []
}

describe('PaintRatioBoard', () => {
  let rectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    storage.items.clear()
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(300, 225))
  })

  afterEach(() => vi.restoreAllMocks())

  it('shows the template until the first stroke and again after undoing it', async () => {
    const wrapper = mountBoard()
    expect(layers(wrapper)).toEqual([{ kind: 'template' }])
    expect(wrapper.findComponent(LayerCanvas).props('templateSrc')).toBe('blob:template')

    await paint(wrapper, 1, [30, 30], [60, 60])
    expect(painted(wrapper)).toHaveLength(1)

    await button(wrapper, 'Rückgängig').trigger('click')
    expect(layers(wrapper)).toEqual([{ kind: 'template' }])
  })

  it('starts with the player colour in lower case', () => {
    const wrapper = mountBoard()

    expect(wrapper.get<HTMLInputElement>('input[aria-label="Farbe"]').element.value).toBe('#3049e8')
    expect(hold(wrapper).props('color')).toBe('#3049e8')
  })

  it('records a stroke in canvas units', async () => {
    const wrapper = mountBoard()

    await paint(wrapper, 1, [0, 0], [150, 75])
    await confirm(wrapper)

    expect(wrapper.emitted('guess')).toEqual([
      [{ strokes: [{ brush: 1, color: '#3049e8', points: [0, 0, 600, 300] }] }],
    ])
  })

  it('paints with the chosen brush and colour', async () => {
    const wrapper = mountBoard()

    await button(wrapper, 'Pinsel groß').trigger('click')
    await wrapper.get('input[aria-label="Farbe"]').setValue('#ff8800')
    await paint(wrapper, 1, [30, 30])

    expect(button(wrapper, 'Pinsel groß').attributes('aria-pressed')).toBe('true')
    expect(button(wrapper, 'Pinsel mittel').attributes('aria-pressed')).toBe('false')
    expect(painted(wrapper)).toEqual([{ brush: 2, color: '#ff8800', points: [120, 120] }])
  })

  it('reads the canvas rect on every move', async () => {
    const wrapper = mountBoard()

    await down(wrapper, 1, [30, 30])
    rectSpy.mockReturnValue(rect(600, 450))
    await move(wrapper, 1, [150, 75])
    await up(wrapper, 1)

    expect(painted(wrapper)[0]!.points).toEqual([120, 120, 300, 150])
  })

  it('lets a finger paint that is not the primary pointer', async () => {
    const wrapper = mountBoard()

    await down(wrapper, 7, [30, 30], false)
    await move(wrapper, 7, [60, 30])
    await up(wrapper, 7)

    expect(painted(wrapper)[0]!.points).toEqual([120, 120, 240, 120])
  })

  it('ignores a second finger while one paints', async () => {
    const wrapper = mountBoard()

    await down(wrapper, 1, [0, 0])
    await down(wrapper, 2, [150, 150])
    await move(wrapper, 2, [200, 200])
    await move(wrapper, 1, [150, 75])
    await up(wrapper, 2)
    await up(wrapper, 1)

    expect(painted(wrapper)).toEqual([{ brush: 1, color: '#3049e8', points: [0, 0, 600, 300] }])
  })

  it('enables „Signieren“ only from the first stroke', async () => {
    const wrapper = mountBoard()
    expect(hold(wrapper).props('disabled')).toBe(true)

    await paint(wrapper, 1, [30, 30])

    expect(hold(wrapper).props('disabled')).toBe(false)
  })

  it('greys the canvas and shows „Signieren …“ while the hold runs', async () => {
    const wrapper = mountBoard()
    await paint(wrapper, 1, [30, 30])
    expect(lock(wrapper).exists()).toBe(false)

    await progress(wrapper, 0.4)
    expect(lock(wrapper).text()).toBe('Signieren …')

    await progress(wrapper, 0)
    expect(lock(wrapper).exists()).toBe(false)
  })

  it('cancels the hold when a finger touches the canvas, and paints nothing then', async () => {
    const wrapper = mountBoard()
    await paint(wrapper, 1, [30, 30])
    await progress(wrapper, 0.4)

    await down(wrapper, 2, [90, 90])
    expect(hold(wrapper).props('disabled')).toBe(true)
    await move(wrapper, 2, [120, 120])
    await up(wrapper, 2)
    await progress(wrapper, 0)
    expect(painted(wrapper)).toHaveLength(1)

    await paint(wrapper, 3, [60, 60])
    expect(painted(wrapper)).toHaveLength(2)
  })

  it('keeps the hold from starting while a finger paints', async () => {
    const wrapper = mountBoard()
    await paint(wrapper, 1, [30, 30])

    await down(wrapper, 2, [60, 60])
    expect(hold(wrapper).props('disabled')).toBe(true)

    await up(wrapper, 2)
    expect(hold(wrapper).props('disabled')).toBe(false)
  })

  it('drops the lock once signed, so a guess that failed leaves the canvas paintable', async () => {
    const wrapper = mountBoard()
    await paint(wrapper, 1, [30, 30])
    await progress(wrapper, 0.9)

    // A completed hold fires `confirm` first, then reports the full ring.
    await confirm(wrapper)
    await progress(wrapper, 1)
    expect(lock(wrapper).exists()).toBe(false)

    await paint(wrapper, 2, [60, 60])
    expect(painted(wrapper)).toHaveLength(2)
  })

  it('sends exactly the strokes on the canvas', async () => {
    const wrapper = mountBoard()
    await paint(wrapper, 1, [0, 0], [30, 0])
    await paint(wrapper, 2, [60, 60])
    await button(wrapper, 'Rückgängig').trigger('click')

    await confirm(wrapper)

    expect(wrapper.emitted('guess')).toEqual([[{ strokes: painted(wrapper) }]])
    expect(painted(wrapper)).toEqual([{ brush: 1, color: '#3049e8', points: [0, 0, 120, 0] }])
  })

  it('undoes and redoes, greyed out without a target', async () => {
    const wrapper = mountBoard()
    expect(button(wrapper, 'Rückgängig').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Wiederholen').attributes('disabled')).toBeDefined()

    await paint(wrapper, 1, [30, 30])
    await button(wrapper, 'Rückgängig').trigger('click')
    expect(button(wrapper, 'Rückgängig').attributes('disabled')).toBeDefined()

    await button(wrapper, 'Wiederholen').trigger('click')
    expect(painted(wrapper)).toHaveLength(1)
    expect(button(wrapper, 'Wiederholen').attributes('disabled')).toBeDefined()
  })

  it('refuses to redo what would break the limits together with the canvas', () => {
    const half = (x: number): Stroke => ({
      brush: 0,
      color: '#3049e8',
      points: Array.from({ length: MAX_POINTS / 2 + 1 }, (_, i) => [x, i % 2]).flat(),
    })
    saveDraft(storage.fake, KEY, { strokes: [half(0)], redo: [half(10)] })

    const wrapper = mountBoard({ draftKey: KEY })

    expect(button(wrapper, 'Wiederholen').attributes('disabled')).toBeDefined()
  })

  it('saves the draft after every change and restores it on mount', async () => {
    const first = mountBoard({ draftKey: KEY })
    await paint(first, 1, [0, 0])
    await paint(first, 2, [30, 30])
    await button(first, 'Rückgängig').trigger('click')

    const dot = (x: number): Stroke => ({ brush: 1, color: '#3049e8', points: [x, x] })
    expect(loadDraft(storage.fake, KEY, 3)).toEqual({ strokes: [dot(0)], redo: [dot(120)] })
    first.unmount()

    const second = mountBoard({ draftKey: KEY })
    expect(painted(second)).toEqual([dot(0)])
    await button(second, 'Wiederholen').trigger('click')
    expect(painted(second)).toEqual([dot(0), dot(120)])
  })

  it('keeps no draft without a key', async () => {
    const wrapper = mountBoard()

    await paint(wrapper, 1, [30, 30])

    expect(storage.items.size).toBe(0)
  })

  it('paints nothing and signs nothing while disabled', async () => {
    const wrapper = mountBoard({ disabled: true })

    await paint(wrapper, 1, [30, 30])

    expect(layers(wrapper)).toEqual([{ kind: 'template' }])
    expect(hold(wrapper).props('disabled')).toBe(true)
  })

  it('says so when the picture failed to load', () => {
    expect(mountBoard().text()).not.toContain('Das Bild ließ sich nicht laden.')
    expect(mountBoard({ pictureFailed: true }).text()).toContain('Das Bild ließ sich nicht laden.')
  })

  it('states the tolerance in the award box', () => {
    const wrapper = mountBoard({ awardRule: 'ALL_QUALIFYING', awardPoints: 1 })
    const five = new Intl.NumberFormat('de-DE', { style: 'percent' }).format(0.05)

    expect(wrapper.text()).toContain(`Dein Anteil darf um höchstens ${five} vom Ziel abweichen.`)
  })
})
