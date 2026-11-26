import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import TowerView from '../TowerView.vue'
import { barFill, barHue } from '../colors'
import { prefersReducedMotion } from '@/ui/motion'

vi.mock('@/ui/motion', () => ({ prefersReducedMotion: vi.fn(() => false) }))

const board = vi.hoisted(() => ({ widthPx: 0 }))
vi.mock('@vueuse/core', async (importOriginal) => {
  const { computed } = await import('vue')
  return {
    ...(await importOriginal<typeof import('@vueuse/core')>()),
    useElementSize: () => ({ width: computed(() => board.widthPx), height: computed(() => 0) }),
  }
})

const scheme = vi.hoisted(() => ({ dark: false }))
vi.mock('@/ui/colorScheme', async () => {
  const { computed } = await import('vue')
  return { useDarkScheme: () => computed(() => scheme.dark) }
})

enableAutoUnmount(afterEach)

const BARS = [
  { left: 170, width: 660 },
  { left: 200, width: 600 },
  { left: 260, width: 540 },
]

function mountTower(props: Partial<InstanceType<typeof TowerView>['$props']> = {}) {
  return mount(TowerView, {
    props: {
      fieldWidth: 1000,
      hueStart: 100,
      bars: BARS,
      cuts: [],
      perfects: [],
      slider: null,
      target: null,
      ...props,
    },
  })
}

const bars = (w: ReturnType<typeof mountTower>) => w.findAll('[data-test="bar"]')
const glow = (w: ReturnType<typeof mountTower>) => w.findAll('[data-test="glow"]')
const sparkles = (w: ReturnType<typeof mountTower>) => w.findAll('[data-test="sparkle"]')

describe('TowerView', () => {
  afterEach(() => vi.mocked(prefersReducedMotion).mockReturnValue(false))

  it('one rect per bar, coloured round the wheel', () => {
    const w = mountTower()

    expect(bars(w).map((b) => b.attributes('fill'))).toEqual(
      [0, 1, 2].map((i) => barFill(barHue(100, i), false)),
    )
  })

  it('the target floor is gold, glows and sparkles', () => {
    const w = mountTower({ target: 2 })

    expect(bars(w)[2]!.attributes('fill')).toMatch(/^url\(#/)
    expect(bars(w)[0]!.attributes('fill')).toMatch(/^oklch/)
    expect(bars(w)[1]!.attributes('fill')).toMatch(/^oklch/)
    expect(glow(w)).toHaveLength(1)
    expect(sparkles(w)).toHaveLength(5)

    expect(glow(mountTower({ target: null }))).toHaveLength(0)
    expect(sparkles(mountTower({ target: null }))).toHaveLength(0)
  })

  it('the sliding bar on the target floor is gold too', () => {
    const w = mountTower({ target: 3, slider: { floor: 3, width: 540, x: 40 } })
    const slider = w.get('[data-test="slider"]')

    expect(slider.attributes('fill')).toMatch(/^url\(#/)
    expect(glow(w)).toHaveLength(1)
    expect(sparkles(w)).toHaveLength(5)
  })

  it('under reduced motion the gold stands still', () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(true)
    const w = mountTower({ target: 2 })

    expect(glow(w)).toHaveLength(1)
    expect(sparkles(w)).toHaveLength(5)
    expect(w.findAll('animate')).toHaveLength(0)
  })

  it('the gold animates otherwise', () => {
    const w = mountTower({ target: 2 })

    expect(w.findAll('animate').length).toBeGreaterThanOrEqual(6)
  })

  it("the guide line stands on the top bar's centre", () => {
    const w = mountTower()
    const line = w.get('[data-test="guide"]')

    expect(Number(line.attributes('x1'))).toBe(260 + 540 / 2)
    expect(Number(line.attributes('x2'))).toBe(260 + 540 / 2)
  })

  it('names the height', () => {
    expect(mountTower().get('svg').attributes('aria-label')).toBe('2 Stockwerke')
    expect(
      mountTower({ bars: [BARS[0]!, BARS[1]!] })
        .get('svg')
        .attributes('aria-label'),
    ).toBe('1 Stockwerk')
  })

  it('cuts fall, or vanish under reduced motion', () => {
    const cuts = [{ floor: 2, left: 200, width: 60 }]

    expect(mountTower({ cuts }).findAll('[data-test="cut"]')).toHaveLength(1)

    vi.mocked(prefersReducedMotion).mockReturnValue(true)
    expect(mountTower({ cuts }).findAll('[data-test="cut"]')).toHaveLength(0)
  })

  it('a cut falls by a CSS animation, which starts when it is inserted', () => {
    const w = mountTower({ cuts: [{ floor: 2, left: 200, width: 60 }] })

    expect(w.get('[data-test="cut"]').classes()).toContain('stack-fall')
    expect(w.findAll('[data-test="cut"] animate')).toHaveLength(0)
  })

  it('a cut off the gold bar falls gold', () => {
    const w = mountTower({ target: 2, cuts: [{ floor: 2, left: 200, width: 60 }] })

    expect(w.get('[data-test="cut"] rect').attributes('fill')).toMatch(/^url\(#/)
    expect(
      mountTower({ target: 1, cuts: [{ floor: 2, left: 200, width: 60 }] })
        .get('[data-test="cut"] rect')
        .attributes('fill'),
    ).toMatch(/^oklch/)
  })

  it('the glow is painted behind the bars', () => {
    const w = mountTower({ target: 2 })
    const order = w
      .findAll('[data-test="glow"], [data-test="bar"]')
      .map((n) => n.attributes('data-test'))

    expect(order[0]).toBe('glow')
  })

  it('a tall tower scrolls, the board keeps its size', () => {
    const tall = Array.from({ length: 40 }, () => ({ left: 200, width: 600 }))
    const w = mountTower({ bars: tall, slider: { floor: 40, width: 600, x: 0 } })

    expect(w.get('svg').attributes('viewBox')).toBe('0 0 1000 1200')

    const slider = w.get('[data-test="slider"]')
    const shift = Number(
      /translateY\((-?[\d.]+)px\)/.exec(
        w.get('[data-test="tower"]').attributes('style') ?? '',
      )?.[1],
    )
    const y = Number(slider.attributes('y')) + shift

    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(1200 / 3)
  })

  it('fitted, a tall tower zooms out until every bar is on the picture', () => {
    const tall = Array.from({ length: 40 }, () => ({ left: 200, width: 600 }))
    const w = mountTower({ bars: tall, fit: true })

    // 42 floors of 60 and 64 of ground = 2584 high, the board's shape kept → 2153 wide, centred.
    expect(w.get('svg').attributes('viewBox')).toBe(`-577 ${1200 - 2584} 2153 2584`)
    expect(w.get('[data-test="tower"]').attributes('style')).toContain('translateY(0px)')
  })

  it('fitted, a short tower keeps the board as it is', () => {
    expect(mountTower({ fit: true }).get('svg').attributes('viewBox')).toBe('0 0 1000 1200')
  })

  it('height and bar thickness stay put in pixels when the board is wider', () => {
    board.widthPx = 750
    const w = mountTower()

    // 750 px for 1000 units: 0.75 px a unit, so 450 px are 600 units and a 22.5 px bar is 30.
    expect(w.get('svg').attributes('viewBox')).toBe('0 0 1000 600')
    expect(w.get('svg').attributes('style')).toContain('height: 450px')
    expect(bars(w)[0]!.attributes('height')).toBe('30')
    board.widthPx = 0
  })

  it('every bar carries a shade, lit on top and darker below', () => {
    const w = mountTower()

    expect(w.findAll('[data-test="shade"]')).toHaveLength(bars(w).length)
    expect(w.get('[data-test="shade"]').attributes('fill')).toMatch(/^url\(#shade-/)
  })

  it('a perfect floor sparkles at both bottom corners', () => {
    const w = mountTower({ perfects: [1] })
    const sparkles = w.findAll('[data-test="perfect"] .stack-sparkle')

    expect(sparkles).toHaveLength(2)
  })

  it('the sparkle is deep gold on the light board, bright on the dark one', () => {
    scheme.dark = false
    expect(
      mountTower({ perfects: [1] })
        .get('.stack-sparkle')
        .attributes('fill'),
    ).toBe('#A87A0E')

    scheme.dark = true
    expect(
      mountTower({ perfects: [1] })
        .get('.stack-sparkle')
        .attributes('fill'),
    ).toBe('#FFFBE6')
    scheme.dark = false
  })

  it('a short tower does not scroll', () => {
    const w = mountTower()

    expect(w.get('[data-test="tower"]').attributes('style')).toContain('translateY(0px)')
  })
})
