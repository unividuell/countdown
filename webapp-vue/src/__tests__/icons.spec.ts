import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconUsers from '~icons/lucide/users'

describe('icon bundling', () => {
  it('renders a Lucide icon as an inline svg', () => {
    const w = mount(IconUsers)
    expect(w.element.tagName.toLowerCase()).toBe('svg')
  })

  it('inherits colour and size from the surrounding text', () => {
    const w = mount(IconUsers)
    expect(w.attributes('width')).toBe('1em')
    expect(w.html()).toContain('currentColor')
  })
})
