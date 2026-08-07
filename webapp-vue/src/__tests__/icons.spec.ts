import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconCheck from '~icons/lucide/check'

describe('icon bundling', () => {
  it('renders a Lucide icon as an inline svg', () => {
    const w = mount(IconCheck)
    expect(w.element.tagName.toLowerCase()).toBe('svg')
  })

  it('inherits colour and size from the surrounding text', () => {
    const w = mount(IconCheck)
    expect(w.attributes('width')).toBe('1em')
    expect(w.attributes('height')).toBe('1em')
    expect(w.html()).toContain('currentColor')
  })
})
