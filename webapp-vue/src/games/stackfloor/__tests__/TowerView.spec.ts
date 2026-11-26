import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import TowerView from '../TowerView.vue'
import { barFill, barHue } from '../colors'
import { prefersReducedMotion } from '@/ui/motion'

vi.mock('@/ui/motion', () => ({ prefersReducedMotion: vi.fn(() => false) }))

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

  it('a tall tower scrolls, the board keeps its size', () => {
    const tall = Array.from({ length: 40 }, () => ({ left: 200, width: 600 }))
    const w = mountTower({ bars: tall, slider: { floor: 40, width: 600, x: 0 } })

    expect(w.get('svg').attributes('viewBox')).toBe('0 0 1000 1333')

    const slider = w.get('[data-test="slider"]')
    const shift = Number(
      /translateY\((-?[\d.]+)px\)/.exec(
        w.get('[data-test="tower"]').attributes('style') ?? '',
      )?.[1],
    )
    const y = Number(slider.attributes('y')) + shift

    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(1333 / 3)
  })

  it('a short tower does not scroll', () => {
    const w = mountTower()

    expect(w.get('[data-test="tower"]').attributes('style')).toContain('translateY(0px)')
  })
})
