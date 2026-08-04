import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActionButton from '@/ui/ActionButton.vue'

describe('ActionButton', () => {
  it('keeps the label readable and shows no spinner at rest', () => {
    const w = mount(ActionButton, { slots: { default: 'Freischalten' } })

    expect(w.text()).toContain('Freischalten')
    expect(w.find('[data-test=spinner]').exists()).toBe(false)
    expect(w.attributes('disabled')).toBeUndefined()
    expect(w.attributes('aria-busy')).toBe('false')
  })

  it('reserves the icon slot on both sides so the label stays centred', () => {
    const w = mount(ActionButton, { slots: { default: 'Freischalten' } })

    // Two reserved slots at rest, and still two elements once one holds the spinner:
    // the button width and the label position must not change between states.
    expect(w.findAll('[data-test=slot]')).toHaveLength(2)
  })

  it('disables itself and shows the spinner while busy, without hiding the label', () => {
    const w = mount(ActionButton, { props: { busy: true }, slots: { default: 'Freischalten' } })

    expect(w.text()).toContain('Freischalten')
    expect(w.find('[data-test=spinner]').exists()).toBe(true)
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.attributes('aria-busy')).toBe('true')
  })

  it('can be disabled independently of being busy', () => {
    const w = mount(ActionButton, { props: { disabled: true }, slots: { default: 'Erstellen' } })

    expect(w.attributes('disabled')).toBeDefined()
    expect(w.find('[data-test=spinner]').exists()).toBe(false)
  })

  it('can act as a form submit button', () => {
    const w = mount(ActionButton, { props: { type: 'submit' }, slots: { default: 'Erstellen' } })

    expect(w.attributes('type')).toBe('submit')
  })
})
