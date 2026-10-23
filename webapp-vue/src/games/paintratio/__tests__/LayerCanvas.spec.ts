import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import LayerCanvas from '@/games/paintratio/LayerCanvas.vue'
import { CANVAS_GROUND } from '@/games/paintratio/render'
import type { CanvasLayer } from '@/games/paintratio/render'
import type { Stroke } from '@/games/paintratio/types'

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
        (...args: unknown[]) =>
          log.push([name, ...args]),
      set: (_target, name: string, value: unknown) => {
        log.push(['set ' + name, value])
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D

  return { ctx, log }
}

const RED: Stroke = { brush: 0, color: '#ff0000', points: [400, 400] }
const BLUE: Stroke = { brush: 2, color: '#0000ff', points: [800, 100] }

function mountCanvas(layers: CanvasLayer[]) {
  return mount(LayerCanvas, {
    props: { width: 1200, height: 900, brushes: [40, 80, 160], layers, templateSrc: 'blob:t' },
  })
}

describe('LayerCanvas', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 225,
      right: 300,
      bottom: 225,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('mounts and draws nothing without a 2D context', async () => {
    const wrapper = mountCanvas([{ kind: 'strokes', strokes: [RED] }, { kind: 'template' }])

    await wrapper.get('img').trigger('load')
    wrapper.vm.drawSegment(RED, 0)

    expect(wrapper.find('canvas').exists()).toBe(true)
  })

  it('draws the template picture and the strokes in the order of the layers', async () => {
    const { ctx, log } = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    const wrapper = mountCanvas([
      { kind: 'strokes', strokes: [RED] },
      { kind: 'template' },
      { kind: 'strokes', strokes: [BLUE] },
    ])

    log.length = 0
    await wrapper.get('img').trigger('load')

    const painted = log
      .filter(([name]) => name === 'set fillStyle' || name === 'drawImage')
      .map(([name, value]) => (name === 'drawImage' ? 'picture' : value))
    expect(painted).toEqual([CANVAS_GROUND, '#ff0000', 'picture', '#0000ff'])
    expect(log.find(([name]) => name === 'drawImage')).toEqual([
      'drawImage',
      wrapper.get('img').element,
      0,
      0,
      300,
      225,
    ])
  })

  it('waits for the picture before it draws the template', () => {
    const { ctx, log } = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    mountCanvas([{ kind: 'template' }])

    expect(log.some(([name]) => name === 'drawImage')).toBe(false)
    expect(log).toContainEqual(['fillRect', 0, 0, 300, 225])
  })

  it('sizes the backing store to the CSS size times the pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const { ctx, log } = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    const wrapper = mountCanvas([{ kind: 'strokes', strokes: [RED] }])

    const el = wrapper.get<HTMLCanvasElement>('canvas').element
    expect([el.width, el.height]).toEqual([600, 450])
    expect(log).toContainEqual(['arc', 200, 200, 10, 0, 2 * Math.PI])
  })

  it('draws a piece of a stroke on top, scaled like the rest', () => {
    const { ctx, log } = recorder()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    const wrapper = mountCanvas([])

    log.length = 0
    wrapper.vm.drawSegment({ brush: 1, color: '#00ff00', points: [0, 0, 400, 400, 800, 0] }, 2)

    expect(log).toContainEqual(['moveTo', 100, 100])
    expect(log).toContainEqual(['lineTo', 200, 0])
    expect(log).not.toContainEqual(['set fillStyle', CANVAS_GROUND])
  })
})

describe('CANVAS_GROUND', () => {
  it('is an off-white, so the canvas shows where it ends on the white card', () => {
    expect(CANVAS_GROUND).toBe('#f5f5f5')
  })
})
