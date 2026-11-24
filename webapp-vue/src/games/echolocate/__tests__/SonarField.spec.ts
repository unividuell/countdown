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
      pinColorHex: '#7c3aed',
      pending: null,
      ...over,
    },
  })
}

/** The calls right after the `arc` that traced a circle at (x, y) with radius r, in px. */
function after(log: Call[], x: number, y: number, r: number, count: number): Call[] {
  const at = log.findIndex(
    ([name, ...args]) => name === 'arc' && args[0] === x && args[1] === y && args[2] === r,
  )

  return at < 0 ? [] : log.slice(at + 1, at + 1 + count)
}

/** The handler runs a little after the finger came down: the clock has moved on by then. */
function pointerDown(field: ReturnType<typeof mountField>, clientX: number, clientY: number) {
  const event = new PointerEvent('pointerdown', { clientX, clientY, bubbles: true, pointerId: 1 })
  vi.mocked(performance.now).mockReturnValue(event.timeStamp + 40)
  field.get('canvas').element.dispatchEvent(event)

  return event
}

function pointerMove(field: ReturnType<typeof mountField>, clientX: number, clientY: number) {
  field
    .get('canvas')
    .element.dispatchEvent(
      new PointerEvent('pointermove', { clientX, clientY, bubbles: true, pointerId: 1 }),
    )
}

function pointer(field: ReturnType<typeof mountField>, type: 'pointerup' | 'pointercancel') {
  field.get('canvas').element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 }))
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

  // The click is told on the way up — iOS takes that as a gesture that may start the sound — but
  // at the place and time of the way down, so a ring is as quick as the reaction.
  it('emits a short click on release, in cell units with the time the finger came down', () => {
    const field = mountField()

    const event = pointerDown(field, 60, 170)
    expect(field.emitted('tap')).toBeUndefined()

    pointer(field, 'pointerup')
    expect(field.emitted('tap')).toEqual([[{ x: 5, y: 15 }, event.timeStamp]])
    expect(field.emitted('hold')).toBeUndefined()
  })

  // Sparks belong to the ping alone: not to a mark, not to a pin.
  it('throws sparks where a ping goes out, never on a mere touch', async () => {
    const field = mountField()
    const frames = vi.mocked(requestAnimationFrame)

    pointerDown(field, 60, 170)
    pointer(field, 'pointerup')
    expect(frames).not.toHaveBeenCalled()

    await field.setProps({ pending: { x: 5, y: 15 } })
    expect(frames).toHaveBeenCalled()
  })

  it('emits a long click after 500 ms held, and no short one on release', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const field = mountField()

      pointerDown(field, 60, 170)
      vi.advanceTimersByTime(499)
      expect(field.emitted('hold')).toBeUndefined()

      vi.advanceTimersByTime(1)
      expect(field.emitted('hold')).toEqual([[{ x: 5, y: 15 }]])

      pointer(field, 'pointerup')
      expect(field.emitted('tap')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits nothing for a finger that drags: neither a ping nor, held long, a pin', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const quick = mountField()
      pointerDown(quick, 60, 170)
      pointerMove(quick, 60, 182)
      pointer(quick, 'pointerup')
      expect(quick.emitted('tap')).toBeUndefined()

      const slow = mountField()
      pointerDown(slow, 60, 170)
      pointerMove(slow, 72, 170)
      vi.advanceTimersByTime(1000)
      pointer(slow, 'pointerup')
      expect(slow.emitted('hold')).toBeUndefined()
      expect(slow.emitted('tap')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgives a finger that wobbles a few pixels while it holds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const field = mountField()

      pointerDown(field, 60, 170)
      pointerMove(field, 64, 173)
      vi.advanceTimersByTime(500)

      expect(field.emitted('hold')).toEqual([[{ x: 5, y: 15 }]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits nothing for a finger the browser took back', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const field = mountField()

      pointerDown(field, 60, 170)
      pointer(field, 'pointercancel')
      vi.advanceTimersByTime(1000)
      pointer(field, 'pointerup')

      expect(field.emitted('tap')).toBeUndefined()
      expect(field.emitted('hold')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
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

  it('explains the map in a legend, the tolerance circle in phase one only', () => {
    const items = (solution: EchoLocateSolution) =>
      mountField({ solution })
        .get('[data-test="sonar-legend"]')
        .findAll('li')
        .map((item) => item.text())
    const noises = ['V Vögel', 'B Bach', 'K Kuh', 'W Wind', 'R Regen']

    expect(items(SOLUTION)).toEqual([...noises, 'Spruch', 'Toleranzkreis'])
    expect(items({ ...SOLUTION, toleranceRadius: null })).toEqual([...noises, 'Spruch'])
    expect(mountField().find('[data-test="sonar-legend"]').exists()).toBe(false)
  })

  it("draws the pins in their player's colour, outlined white for the dark ground", () => {
    mountField({ pins: [{ x: 4, y: 5 }], pinColorHex: '#1e3a8a' })

    expect(after(log, 40, 50, 6, 6)).toEqual([
      ['set fillStyle', '#1e3a8a'],
      ['fill'],
      ['set strokeStyle', '#ffffff'],
      ['set lineWidth', 2],
      ['stroke'],
      ['set lineWidth', 1],
    ])
  })

  it("draws everyone else's pins smaller, each in its own player's colour", () => {
    mountField({
      solution: SOLUTION,
      otherPins: [
        { at: { x: 2, y: 3 }, colorHex: '#fde047' },
        { at: { x: 12, y: 13 }, colorHex: '#111827' },
      ],
    })

    const outlined = (colorHex: string) => [
      ['set fillStyle', colorHex],
      ['fill'],
      ['set strokeStyle', 'rgba(255,255,255,0.6)'],
      ['stroke'],
    ]
    expect(after(log, 20, 30, 4, 4)).toEqual(outlined('#fde047'))
    expect(after(log, 120, 130, 4, 4)).toEqual(outlined('#111827'))
  })

  it('takes no taps as a map, so a finger there scrolls the page', () => {
    const field = mountField({ solution: SOLUTION })

    pointerDown(field, 60, 170)

    expect(field.emitted('tap')).toBeUndefined()
    expect(field.get('canvas').classes()).not.toContain('touch-none')
    expect(mountField().get('canvas').classes()).toContain('touch-none')
  })

  describe('listening on the map', () => {
    // Clip (5, 7) sits at (65, 95) on the page; its tolerance circle is 15 px around it.
    const click = (field: ReturnType<typeof mountField>, clientX: number, clientY: number) =>
      field.get('canvas').trigger('click', { clientX, clientY })
    const clip = (place: number) => ({ kind: 'clip' as const, place })
    const noise = (place: number) => ({ kind: 'noise' as const, place })

    // K stands at (65, 35) on the page; its letter is 10 px, so 6 px around its centre.
    it('asks to hear a noise on a click on its letter, not beside it', async () => {
      const field = mountField({ solution: SOLUTION, listenable: true })

      await click(field, 65 + 5, 35)
      await click(field, 65 + 7, 35)

      expect(field.emitted('listen')).toEqual([[noise(2)]])
    })

    it('gives a letter inside a tolerance circle to the noise', async () => {
      const noises = [{ cell: { col: 6, row: 7 }, kind: 'COW' as const }]
      const field = mountField({ solution: { ...SOLUTION, noises }, listenable: true })

      await click(field, 75, 95)
      await click(field, 65, 95)

      expect(field.emitted('listen')).toEqual([[noise(0)], [clip(0)]])
    })

    it('turns the letter of the noise sounding white', () => {
      mountField({ solution: SOLUTION, listenable: true, playing: noise(2) })

      const at = log.findIndex(([name, text]) => name === 'fillText' && text === 'K')
      expect(log[at - 1]).toEqual(['set fillStyle', '#ffffff'])
      expect(log).toContainEqual(['set fillStyle', 'rgba(248,113,113,0.9)'])
    })

    it('asks to hear a clip on a click inside its tolerance circle, not beside it', async () => {
      const field = mountField({ solution: SOLUTION, listenable: true })

      await click(field, 65 + 14, 95)
      await click(field, 65 + 16, 95)

      expect(field.emitted('listen')).toEqual([[clip(0)]])
    })

    it('takes the dot in phase two, which has no circle', async () => {
      const field = mountField({
        solution: { ...SOLUTION, toleranceRadius: null },
        listenable: true,
      })

      // The dot is 8 px: 0.6 of a 10 px cell is less.
      await click(field, 65 + 7, 95)
      await click(field, 65 + 9, 95)

      expect(field.emitted('listen')).toEqual([[clip(0)]])
    })

    it('hands overlapping circles to the nearer clip', async () => {
      const targets = [
        { col: 5, row: 7 },
        { col: 7, row: 7 },
      ]
      const field = mountField({ solution: { ...SOLUTION, targets }, listenable: true })

      await click(field, 65 + 12, 95)

      expect(field.emitted('listen')).toEqual([[clip(1)]])
    })

    it('hears nothing unless listenable, nor on the board', async () => {
      const unheard = mountField({ solution: SOLUTION })
      await click(unheard, 65, 95)
      expect(unheard.emitted('listen')).toBeUndefined()
      expect(unheard.find('[data-test="sonar-listen-hint"]').exists()).toBe(false)

      const board = mountField({ listenable: true })
      await click(board, 65, 95)
      expect(board.emitted('listen')).toBeUndefined()
    })

    it('says what a click does, by phase', () => {
      const hint = (toleranceRadius: number | null) =>
        mountField({ solution: { ...SOLUTION, toleranceRadius }, listenable: true })
          .get('[data-test="sonar-listen-hint"]')
          .text()

      expect(hint(1.5)).toBe('Klick auf Toleranzkreis oder Buchstabe: anhören')
      expect(hint(null)).toBe('Klick auf Spruch oder Buchstabe: anhören')
    })

    it('lights up the circle of the clip sounding', async () => {
      const field = mountField({ solution: SOLUTION, listenable: true })
      expect(log).toContainEqual(['set fillStyle', 'rgba(52,211,153,0.15)'])

      log.length = 0
      await field.setProps({ playing: clip(0) })

      expect(log).toContainEqual(['set fillStyle', 'rgba(52,211,153,0.35)'])
      expect(log).not.toContainEqual(['set fillStyle', 'rgba(52,211,153,0.15)'])
    })

    it('rings the dot of the clip sounding in phase two', () => {
      mountField({
        solution: { ...SOLUTION, toleranceRadius: null },
        listenable: true,
        playing: clip(0),
      })

      expect(after(log, 55, 75, 11, 4)).toEqual([
        ['set strokeStyle', '#ffffff'],
        ['set lineWidth', 2],
        ['stroke'],
        ['set lineWidth', 1],
      ])
    })
  })

  // No cover: the first click is the first ping. Until then the field says what hides in it.
  it('names how many clips hide in the field until the first ping, and takes no click for it', () => {
    const hint = (over: Record<string, unknown>) =>
      mountField(over).find('[data-test="sonar-count"]')

    expect(hint({ clips: 1 }).text()).toBe('1 Spruch')
    expect(hint({ clips: 2 }).text()).toBe('2 Sprüche')
    expect(hint({ clips: 2 }).classes()).toContain('pointer-events-none')
    expect(
      hint({ clips: 2, waves: [{ at: { x: 1, y: 1 }, startMs: null, endMs: null }] }).exists(),
    ).toBe(false)
    expect(mountField({ clips: 2 }).find('button').exists()).toBe(false)
  })

  it('keeps the long press to itself: no callout, no context menu', () => {
    const canvas = mountField().get('canvas')

    expect(canvas.classes()).toContain('[-webkit-touch-callout:none]')
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    canvas.element.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  it('names the field for assistive technology', () => {
    expect(mountField().get('canvas').attributes('aria-label')).toBe('Sonarfeld')
  })
})
