import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandPoster from '@/ui/ramp/BandPoster.vue'
import RasterPoster from '@/ui/ramp/RasterPoster.vue'

const scene = { game: 'Anmaßung', roundNumber: -98, phaseTwo: true, points: 12 }
const props = { ...scene, running: true, tilt: 0 as const }

// happy-dom ships an `animate` of its own: nothing may animate here, so take it away.
const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    value: undefined,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  if (saved) Object.defineProperty(Element.prototype, 'animate', saved)
  else delete (Element.prototype as { animate?: unknown }).animate
})

describe.each([
  ['BandPoster', BandPoster],
  ['RasterPoster', RasterPoster],
])('%s', (_, Poster) => {
  it('names the round', () => {
    const w = mount(Poster, { props })

    expect(w.get('[data-test="ramp-poster"]').attributes('aria-label')).toBe(
      'Aktuelle Runde −98: Anmaßung. 12 Punkte zum Abstauben. Öffnen.',
    )
    expect(w.text()).toContain('Aktuelle Runde')
    expect(w.text()).toContain('№ −98')
  })

  it('opens and is gone at once where nothing may animate', async () => {
    const w = mount(Poster, { props })

    await w.get('[data-test="ramp-poster"]').trigger('click')
    await flushPromises()

    expect(w.emitted('open')).toHaveLength(1)
    expect(w.emitted('gone')).toHaveLength(1)
  })

  it('is still gone when an animation fails for another reason than a cancel', async () => {
    // `finished` rejecting with a plain error: the round must not stay under the poster.
    Object.defineProperty(Element.prototype, 'animate', {
      value: () => ({ finished: Promise.reject(new Error('no finished')) }),
      configurable: true,
      writable: true,
    })
    const errorHandler = vi.fn()
    const w = mount(Poster, { props, global: { config: { errorHandler } } })

    await w.get('[data-test="ramp-poster"]').trigger('click')
    await flushPromises()

    expect(w.emitted('gone')).toHaveLength(1)
    expect(errorHandler).toHaveBeenCalled()
  })

  it('opens once however often it is tapped', async () => {
    const w = mount(Poster, { props })
    const button = w.get('[data-test="ramp-poster"]')

    await button.trigger('click')
    await button.trigger('click')
    await flushPromises()

    expect(w.emitted('open')).toHaveLength(1)
    expect(w.emitted('gone')).toHaveLength(1)
  })
})

describe('BandPoster', () => {
  const Poster = BandPoster

  it('sets the name whole', () => {
    expect(mount(Poster, { props }).text()).toContain('Anmaẞung')
  })

  it('cuts the stake out of a disc', () => {
    const stake = mount(Poster, { props }).get('[data-test="ramp-stake"]')

    // Inside the mask: drawn as a hole, not as ink.
    expect(stake.get('mask [data-test="ramp-stake-number"]').text()).toBe('12')
    expect(stake.get('[data-test="ramp-stake-unit"]').text()).toBe('PUNKTE')
  })

  it('says „Punkt“ for one', () => {
    const w = mount(Poster, { props: { ...props, points: 1 } })

    expect(w.get('[data-test="ramp-stake-unit"]').text()).toBe('PUNKT')
  })

  it.each([
    ['in phase one', { phaseTwo: false }],
    ['without points', { points: null }],
    ['with nothing to win', { points: 0 }],
  ])('has no disc %s', (_, over) => {
    const w = mount(Poster, { props: { ...props, ...over } })

    expect(w.find('[data-test="ramp-stake"]').exists()).toBe(false)
  })

  it('lets every echo travel one of its own names', () => {
    const echoes = mount(Poster, { props }).findAll('[data-test="ramp-echo"]')
    const repeats = echoes[0]!.findAll('span').length

    expect(repeats).toBeGreaterThan(1)
    expect(echoes[0]!.attributes('style')).toContain(`--repeats: ${repeats}`)
  })
})

describe('RasterPoster', () => {
  // Five columns, one row: happy-dom lays nothing out, so the poster has no height.
  const raster = { ...props, game: 'Abc', roundNumber: -1, tilt: 9 as const }
  const cells = (w: ReturnType<typeof mount>) =>
    w.findAll('[data-test="ramp-cell"], [data-test="ramp-stake"]').map((c) => c.text())

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs one name straight into the next, spaces dropped', () => {
    const w = mount(RasterPoster, { props: { ...raster, game: 'Ab c', phaseTwo: false } })

    expect(cells(w)).toEqual(['A', 'b', 'c', 'A', 'b'])
  })

  it('covers the round’s letter with the stake', () => {
    // −1 in a name of three: the third letter.
    const w = mount(RasterPoster, { props: raster })

    expect(cells(w)).toEqual(['A', 'b', '12Punkte', 'A', 'b'])
  })

  it('says „Punkt“ for one', () => {
    const w = mount(RasterPoster, { props: { ...raster, points: 1 } })

    expect(w.get('[data-test="ramp-stake"]').text()).toBe('1Punkt')
  })

  it('moves the stake on one cell per beat and frees the letter it covered', async () => {
    vi.useFakeTimers()
    const w = mount(RasterPoster, { props: raster })

    vi.advanceTimersByTime(1400)
    await w.vm.$nextTick()

    // Every name has its stake: the one of the name before has moved into the first cell.
    expect(cells(w)).toEqual(['12Punkte', 'b', 'c', '12Punkte', 'b'])
  })

  it('holds the stake while it may not run', async () => {
    vi.useFakeTimers()
    const w = mount(RasterPoster, { props: { ...raster, running: false } })

    vi.advanceTimersByTime(1400)
    await w.vm.$nextTick()

    expect(cells(w)).toEqual(['A', 'b', '12Punkte', 'A', 'b'])
  })

  it.each([
    ['in phase one', { phaseTwo: false }],
    ['without points', { points: null }],
    ['with nothing to win', { points: 0 }],
  ])('has no stake %s', (_, over) => {
    const w = mount(RasterPoster, { props: { ...raster, ...over } })

    expect(w.find('[data-test="ramp-stake"]').exists()).toBe(false)
  })

  it.each([
    [-9, 3],
    [0, 4],
    [9, 5],
  ] as const)('sets tilt %i in %i columns', (tilt, columns) => {
    const w = mount(RasterPoster, { props: { ...raster, tilt } })

    expect(cells(w)).toHaveLength(columns)
  })
})
