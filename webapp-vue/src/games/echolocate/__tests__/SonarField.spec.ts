import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import SonarField from '@/games/echolocate/SonarField.vue'
import type { EchoLocateSolution } from '@/games/echolocate/types'

enableAutoUnmount(afterEach)

type Call = [name: string, ...args: unknown[]]

/** A context that writes down every call and every property set, in order. */
function recorder() {
  const log: Call[] = []
  const ctx = new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) => {
          log.push([name, ...args])
          // The ground is a gradient: the field adds stops to whatever comes back.
          return name === 'createRadialGradient' ? { addColorStop: () => undefined } : undefined
        },
      set: (_target, name: string, value: unknown) => {
        log.push(['set ' + name, value])
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D

  return { ctx, log }
}

/** 200 px for 20 cells: 10 px a cell, off the page's corner by (10, 20). */
const RECT: DOMRect = {
  left: 10,
  top: 20,
  width: 200,
  height: 200,
  right: 210,
  bottom: 220,
  x: 10,
  y: 20,
  toJSON: () => ({}),
}

const SOLUTION: EchoLocateSolution = {
  targets: [{ col: 5, row: 7 }],
  noises: [
    { cell: { col: 1, row: 1 }, kind: 'BIRDS' },
    { cell: { col: 3, row: 1 }, kind: 'BROOK' },
    { cell: { col: 5, row: 1 }, kind: 'COW' },
    { cell: { col: 7, row: 1 }, kind: 'WIND' },
    { cell: { col: 9, row: 1 }, kind: 'RAIN' },
  ],
  toleranceRadius: 1.5,
}

function mountField(over: Record<string, unknown> = {}) {
  return mount(SonarField, {
    props: {
      grid: 20,
      speed: 3,
      reach: 12,
      waves: [],
      rings: [],
      pins: [],
      pending: null,
      covered: false,
      ...over,
    },
  })
}

/** The handler runs a little after the finger came down: the clock has moved on by then. */
function pointerDown(field: ReturnType<typeof mountField>, clientX: number, clientY: number) {
  const event = new PointerEvent('pointerdown', { clientX, clientY, bubbles: true })
  vi.mocked(performance.now).mockReturnValue(event.timeStamp + 40)
  field.get('canvas').element.dispatchEvent(event)

  return event
}

describe('SonarField', () => {
  let log: Call[]

  beforeEach(() => {
    const recorded = recorder()
    log = recorded.log
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorded.ctx)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT)
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('emits taps in cell units with the event time', () => {
    const field = mountField()

    const event = pointerDown(field, 60, 170)

    expect(field.emitted('tap')).toEqual([[{ x: 5, y: 15 }, event.timeStamp]])
  })

  it('draws a wave only from its start, out to where it has come', () => {
    const at = { x: 10, y: 10 }
    mountField({ waves: [{ at, startMs: null, endMs: null }] })
    expect(log).not.toContainEqual(['arc', 100, 100, 120, 0, 2 * Math.PI])

    log.length = 0
    // One second at 3 cells a second: 3 cells, 30 px; the reach dashed at 12 cells.
    mountField({ waves: [{ at, startMs: 4000, endMs: 9000 }] })
    expect(log).toContainEqual(['arc', 100, 100, 30, 0, 2 * Math.PI])
    expect(log).toContainEqual(['arc', 100, 100, 120, 0, 2 * Math.PI])
  })

  it('draws the rings around their own ping', () => {
    mountField({
      waves: [
        { at: { x: 4, y: 4 }, startMs: null, endMs: null },
        { at: { x: 10, y: 10 }, startMs: null, endMs: null },
      ],
      rings: [[2], [1.5, 3]],
    })

    const arcs = log.filter(([name]) => name === 'arc').map(([, x, y, r]) => [x, y, r])
    expect(arcs).toEqual(
      expect.arrayContaining([
        [40, 40, 20],
        [100, 100, 15],
        [100, 100, 30],
      ]),
    )
  })

  it('labels the noises V B K W R on the map', () => {
    mountField({ solution: SOLUTION })

    const letters = log.filter(([name]) => name === 'fillText').map(([, text]) => text)
    expect(letters).toEqual(expect.arrayContaining(['V', 'B', 'K', 'W', 'R']))
    expect(log).toContainEqual(['fillText', 'K', 55, 15])
  })

  it("draws a clip's tolerance circle in phase one only", () => {
    // 1.5 cells around the centre of cell (5, 7): 15 px around (55, 75).
    const circle = ['arc', 55, 75, 15, 0, 2 * Math.PI]

    mountField({ solution: SOLUTION })
    expect(log).toContainEqual(circle)

    log.length = 0
    mountField({ solution: { ...SOLUTION, toleranceRadius: null } })
    expect(log).not.toContainEqual(circle)
  })

  it('takes no taps as a map, so a finger there scrolls the page', () => {
    const field = mountField({ solution: SOLUTION })

    pointerDown(field, 60, 170)

    expect(field.emitted('tap')).toBeUndefined()
    expect(field.get('canvas').classes()).not.toContain('touch-none')
    expect(mountField().get('canvas').classes()).toContain('touch-none')
  })

  it('lies under a cover button until the sound is unlocked', () => {
    expect(mountField({ covered: false }).find('button').exists()).toBe(false)

    const field = mountField({ covered: true })
    const cover = field.get('button')
    expect(cover.attributes('type')).toBe('button')
    expect(cover.text()).toBe('Antippen zum Starten')
  })

  // iOS counts a touch as a gesture from its end on: a pointerdown cannot start the graph.
  it('asks to start on a click of the cover, never on a pointerdown', async () => {
    const field = mountField({ covered: true })
    const cover = field.get('button')

    cover.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(field.emitted('start')).toBeUndefined()
    expect(field.emitted('tap')).toBeUndefined()

    await cover.trigger('click')
    expect(field.emitted('start')).toEqual([[]])
    expect(field.emitted('tap')).toBeUndefined()
  })

  it('shows keyboard focus on the cover, and looks and is disabled with the field', () => {
    const cover = mountField({ covered: true }).get('button')
    expect(cover.classes()).toContain('focus-visible:outline-2')
    expect(cover.attributes('disabled')).toBeUndefined()

    const off = mountField({ covered: true, disabled: true }).get('button')
    expect(off.attributes('disabled')).toBeDefined()
    expect(off.classes()).toContain('disabled:opacity-40')
  })

  it('names the field for assistive technology', () => {
    expect(mountField().get('canvas').attributes('aria-label')).toBe('Sonarfeld')
  })
})
