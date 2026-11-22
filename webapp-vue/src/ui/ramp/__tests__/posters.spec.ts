import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandPoster from '@/ui/ramp/BandPoster.vue'
import SheetPoster from '@/ui/ramp/SheetPoster.vue'

const scene = { game: 'Anmaßung', roundNumber: -98, phaseTwo: true, points: 12 }
const props = { ...scene, running: true, tilt: 0 as const, face: 'system' as const }

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
  ['SheetPoster', SheetPoster],
])('%s', (_, Poster) => {
  it('names the round', () => {
    const w = mount(Poster, { props })

    expect(w.get('[data-test="ramp-poster"]').attributes('aria-label')).toBe(
      'Aktuelle Runde −98: Anmaßung. 12 Punkte zum Abstauben. Öffnen.',
    )
    expect(w.text()).toContain('Aktuelle Runde')
    expect(w.text()).toContain('Anmaẞung')
    expect(w.text()).toContain('12 Punkte zum Abstauben')
  })

  it('drops the stake in phase one', () => {
    const w = mount(Poster, { props: { ...props, phaseTwo: false } })

    expect(w.text()).not.toContain('Abstauben')
  })

  it('drops the stake without points', () => {
    const w = mount(Poster, { props: { ...props, points: null } })

    expect(w.text()).not.toContain('Abstauben')
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
  it('prints the round number', () => {
    expect(mount(BandPoster, { props }).text()).toContain('№ −98')
  })
})

describe('SheetPoster', () => {
  it('shows the digits and one sign for a negative round', () => {
    const w = mount(SheetPoster, { props })

    expect(w.text()).toContain('98')
    expect(w.findAll('[data-test="ramp-sign"]')).toHaveLength(1)
  })

  it.each([0, 3])('shows no sign for round %i', (roundNumber) => {
    const w = mount(SheetPoster, { props: { ...props, roundNumber } })

    expect(w.text()).toContain(String(roundNumber))
    expect(w.find('[data-test="ramp-sign"]').exists()).toBe(false)
  })
})
