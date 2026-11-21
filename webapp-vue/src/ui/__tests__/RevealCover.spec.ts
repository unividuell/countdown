import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'
import { soundOnStage } from '@/ui/useSoundAwake'

enableAutoUnmount(afterEach)

const mountCover = (
  props: Partial<{
    state: 'preparing' | 'ready' | 'failed'
    busy: boolean
    timed: boolean
    note: string | null
    beatMs: number
  }> = {},
) => mount(RevealCover, { props: { state: 'ready', busy: false, ...props } })

describe('RevealCover', () => {
  // White glass with secondary-grey text went grey on grey in the dark. The glass follows the
  // mode, thick enough to carry its text over a light scene and a dark one alike.
  it('frosts the scene in the card’s ground, with text in full ink', () => {
    const cover = mountCover({ note: 'Weiter geht’s.' }).get('[data-test="reveal-cover"]')

    expect(cover.classes()).toContain('bg-surface-container-lowest/70')
    expect(cover.classes()).toContain('text-on-surface')
    expect(cover.classes()).not.toContain('bg-white/40')
    expect(cover.find('.text-on-surface-variant').exists()).toBe(false)
  })

  // The start button is black in both modes, so its edge is too: a neutral line, never one that
  // flips with the mode.
  it('gives the black start button the same edge in both modes', () => {
    const button = mountCover().getComponent(HoldButton)

    expect(button.props('color')).toBe('#171717')
    expect(button.props('contour')).toBe('neutral')
  })

  it('says what the reveal costs, in every state', () => {
    for (const state of ['preparing', 'ready', 'failed'] as const) {
      const text = mountCover({ state }).get('[data-test="reveal-cover-cost"]').text()
      expect(text).toBe('Deine Zeit läuft ab dem Aufdecken — und du hast nur einen Versuch.')
    }
  })

  it('names a run, not a clock, for a game that is not timed', () => {
    const text = mountCover({ timed: false }).get('[data-test="reveal-cover-cost"]').text()

    expect(text).toBe('Der Lauf startet mit dem Aufdecken — und du hast nur einen Versuch.')
  })

  it('shows a note under the button when it has one, and none otherwise', () => {
    expect(
      mountCover({ note: 'Neu geladen — dein Lauf wird markiert.' })
        .get('[data-test="reveal-cover-note"]')
        .text(),
    ).toBe('Neu geladen — dein Lauf wird markiert.')
    expect(mountCover().find('[data-test="reveal-cover-note"]').exists()).toBe(false)
  })

  // Peilung names its count there, large: a game may bring its own line in the note's place.
  it('lets a game bring its own note line', () => {
    const cover = mount(RevealCover, {
      props: { state: 'ready', busy: false },
      slots: { note: '<p data-test="own-note" class="text-2xl">2 Sprüche</p>' },
    })

    expect(cover.get('[data-test="own-note"]').text()).toBe('2 Sprüche')
    expect(cover.find('[data-test="reveal-cover-note"]').exists()).toBe(false)
  })

  it('counts in out loud, on every game, and asks the header to wake the graph while here', () => {
    expect(mountCover().getComponent(HoldButton).props('sound')).toBe(true)
    expect(soundOnStage.value).toBe(true)
  })

  it('counts in at the beat the game gives it', () => {
    expect(mountCover({ beatMs: 1300 }).getComponent(HoldButton).props('beatMs')).toBe(1300)
  })

  it('keeps the button out of reach while the scene is still being set up', () => {
    const w = mountCover({ state: 'preparing' })

    expect(w.get('[data-test="reveal-cover-preparing"]').text()).toBe('Wird vorbereitet …')
    expect(w.getComponent(HoldButton).props('ready')).toBe(false)
  })

  it('offers the hold once the scene stands, labelled START, counting three beats', () => {
    const button = mountCover({ state: 'ready' }).getComponent(HoldButton)

    expect(button.props('ready')).toBe(true)
    expect(button.props('label')).toBe('START')
    expect(button.props('beats')).toBe(3)
  })

  it('starts when the hold completes', () => {
    const w = mountCover({ state: 'ready' })

    w.getComponent(HoldButton).vm.$emit('confirm')

    expect(w.emitted('start')).toHaveLength(1)
  })

  it('offers a retry when the scene failed, and a retry never starts anything', async () => {
    const w = mountCover({ state: 'failed' })

    expect(w.get('[data-test="reveal-cover-failed"]').text()).toBe(
      'Das Spiel konnte nicht geladen werden.',
    )
    expect(w.getComponent(HoldButton).props('ready')).toBe(false)
    await w.get('[data-test="reveal-cover-retry"]').trigger('click')

    expect(w.emitted('retry')).toHaveLength(1)
    expect(w.emitted('start')).toBeUndefined()
  })

  it('locks the button while the reveal is on its way', () => {
    expect(mountCover({ busy: true }).getComponent(HoldButton).props('disabled')).toBe(true)
  })

  it('puts a fresh button back once a reveal failed, so a full ring does not claim it runs', async () => {
    const w = mountCover({ busy: true })
    const first = w.getComponent(HoldButton).vm

    await w.setProps({ busy: false })

    expect(w.getComponent(HoldButton).vm).not.toBe(first)
  })

  it('moves focus onto the fresh button when a reveal fails while the cover holds it', async () => {
    // Attached to the document: focus only moves onto a connected element.
    const w = mount(RevealCover, {
      props: { state: 'ready', busy: false },
      attachTo: document.body,
    })
    const before = w.get<HTMLButtonElement>('[data-test="hold-button"]').element
    before.focus()
    expect(document.activeElement).toBe(before)

    await w.setProps({ busy: true })
    await w.setProps({ busy: false })
    await flushPromises()

    const after = w.get<HTMLButtonElement>('[data-test="hold-button"]').element
    expect(after).not.toBe(before)
    expect(document.activeElement).toBe(after)
  })

  it('leaves focus alone when it was outside the cover', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    const w = mount(RevealCover, {
      props: { state: 'ready', busy: false },
      attachTo: document.body,
    })
    outside.focus()

    await w.setProps({ busy: true })
    await w.setProps({ busy: false })
    await flushPromises()

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
