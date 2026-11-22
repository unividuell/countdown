import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandPoster from '@/ui/ramp/BandPoster.vue'

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

describe('BandPoster', () => {
  const Poster = BandPoster

  it('names the round', () => {
    const w = mount(Poster, { props })

    expect(w.get('[data-test="ramp-poster"]').attributes('aria-label')).toBe(
      'Aktuelle Runde −98: Anmaßung. 12 Punkte zum Abstauben. Öffnen.',
    )
    expect(w.text()).toContain('Aktuelle Runde')
    expect(w.text()).toContain('Anmaẞung')
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

describe('BandPoster print', () => {
  it('prints the round number', () => {
    expect(mount(BandPoster, { props }).text()).toContain('№ −98')
  })
})
