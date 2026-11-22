import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Ref } from 'vue'
import { unlockSound } from '@/ui/audio'
import RoundRamp from '@/ui/ramp/RoundRamp.vue'
import type { RampScene } from '@/ui/ramp/posterText'
import { gameSoundOn } from '@/ui/soundOutput'
import { soundOnStage } from '@/ui/useSoundAwake'
import { useCurtainOpen } from '@/ui/curtain'

vi.mock('@/ui/audio', () => ({ unlockSound: vi.fn() }))
vi.mock('@/ui/soundOutput', () => ({ gameSoundOn: vi.fn() }))
vi.mock('@/ui/useSoundAwake', async () => {
  const { ref } = await import('vue')
  return { soundOnStage: ref(true) }
})

// The mock is a plain ref the tests set; the real one is a read-only computed.
const stage = soundOnStage as unknown as Ref<boolean>

const scene: RampScene = { game: 'Anmaßung', roundNumber: -98, phaseTwo: true, points: 12 }

// Shows what the card's contents would see of the curtain.
const Card = defineComponent({
  setup() {
    const open = useCurtainOpen()

    return () => h('p', { 'data-test': 'curtain' }, String(open.value))
  },
})

function mountRamp(s: RampScene | null, options: { attachTo?: HTMLElement } = {}) {
  return mount(RoundRamp, { props: { scene: s }, slots: { default: () => h(Card) }, ...options })
}

const curtain = (w: ReturnType<typeof mountRamp>) => w.get('[data-test="curtain"]').text()

// happy-dom ships an `animate` of its own: nothing may animate here, so take it away.
const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    value: undefined,
    configurable: true,
    writable: true,
  })
  vi.mocked(gameSoundOn).mockReturnValue(true)
  vi.mocked(unlockSound).mockClear()
  stage.value = true
})

afterEach(() => {
  if (saved) Object.defineProperty(Element.prototype, 'animate', saved)
  else delete (Element.prototype as { animate?: unknown }).animate
})

describe('RoundRamp', () => {
  it('stands in front of a card that cannot be used', () => {
    const w = mountRamp(scene)

    expect(w.find('[data-test="ramp"]').exists()).toBe(true)
    expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeDefined()
    expect(w.get('[data-test="ramp-card"]').classes()).toContain('invisible')
    expect(curtain(w)).toBe('false')
  })

  it('isolates the card, so its z-index layers stay under the poster', () => {
    // happy-dom computes no paint order: only the class can be checked here.
    const w = mountRamp(scene)

    expect(w.get('[data-test="ramp-card"]').classes()).toContain('isolate')
  })

  it('is not there without a scene', () => {
    const w = mountRamp(null)

    expect(w.find('[data-test="ramp"]').exists()).toBe(false)
    expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
    expect(curtain(w)).toBe('true')
  })

  it('opens on a tap: card usable, curtain open, focus on the card', async () => {
    const w = mountRamp(scene, { attachTo: document.body })

    await w.get('[data-test="ramp-poster"]').trigger('click')
    await flushPromises()

    expect(w.find('[data-test="ramp"]').exists()).toBe(false)
    expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
    expect(w.get('[data-test="ramp-card"]').classes()).not.toContain('invisible')
    expect(curtain(w)).toBe('true')
    expect(document.activeElement).toBe(w.get('[data-test="ramp-card"]').element)

    w.unmount()
  })

  it.each([
    [true, true, 1], // sound on, a sounding board on screen
    [false, true, 0], // muted
    [true, false, 0], // a silent game: waking would claim the audio session for nothing
  ])('wakes the sound only where it would be heard', async (on, onStage, calls) => {
    vi.mocked(gameSoundOn).mockReturnValue(on)
    stage.value = onStage
    const w = mountRamp(scene)

    await w.get('[data-test="ramp-poster"]').trigger('click')

    expect(unlockSound).toHaveBeenCalledTimes(calls)
  })

  it('goes at once when its scene goes', async () => {
    const w = mountRamp(scene)

    await w.setProps({ scene: null })

    expect(w.find('[data-test="ramp"]').exists()).toBe(false)
    expect(w.get('[data-test="ramp-card"]').attributes('inert')).toBeUndefined()
    expect(curtain(w)).toBe('true')
  })

  it('keeps the focus when its scene goes while the poster has it', async () => {
    const w = mountRamp(scene, { attachTo: document.body })
    w.get<HTMLElement>('[data-test="ramp-poster"]').element.focus()

    await w.setProps({ scene: null })
    await flushPromises()

    expect(document.activeElement).toBe(w.get('[data-test="ramp-card"]').element)

    w.unmount()
  })

  it('does not come back for a scene that arrives later', async () => {
    const w = mountRamp(null)

    await w.setProps({ scene })

    expect(w.find('[data-test="ramp"]').exists()).toBe(false)
  })
})
