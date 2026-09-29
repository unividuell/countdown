import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'

enableAutoUnmount(afterEach)

const mountCover = (
  props: Partial<{ state: 'preparing' | 'ready' | 'failed'; busy: boolean }> = {},
) => mount(RevealCover, { props: { state: 'ready', busy: false, ...props } })

describe('RevealCover', () => {
  it('says what the reveal costs, in every state', () => {
    for (const state of ['preparing', 'ready', 'failed'] as const) {
      const text = mountCover({ state }).get('[data-test="reveal-cover-cost"]').text()
      expect(text).toBe('Deine Zeit läuft ab dem Aufdecken — und du hast nur einen Versuch.')
    }
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
