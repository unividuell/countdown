import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelledDivider from '@/ui/LabelledDivider.vue'

describe('LabelledDivider', () => {
  it('puts its slot between two rules', () => {
    const w = mount(LabelledDivider, { slots: { default: 'Abgeschlossene Runden' } })

    expect(w.get('[data-test="labelled-divider-label"]').text()).toBe('Abgeschlossene Runden')
    // Two decorative rules — the label is the only thing in the reading order.
    const rules = w.findAll('[aria-hidden="true"]')
    expect(rules).toHaveLength(2)
  })
})
