import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ColorSchemeSwitch from '@/nav/ColorSchemeSwitch.vue'
import { COLOR_SCHEME_KEY } from '@/ui/colorScheme'

enableAutoUnmount(afterEach)

const html = () => document.documentElement

function pressed(w: ReturnType<typeof mount>): string[] {
  return w
    .findAll('button')
    .filter((b) => b.attributes('aria-pressed') === 'true')
    .map((b) => b.text())
}

describe('ColorSchemeSwitch', () => {
  beforeEach(() => {
    localStorage.clear()
    delete html().dataset.colorScheme
  })

  // No choice made: the page follows the system, so nothing is pinned on <html> and the
  // stylesheet's `color-scheme: light dark` decides.
  it('follows the system until the user picks', () => {
    const w = mount(ColorSchemeSwitch)

    expect(pressed(w)).toEqual(['System'])
    expect(html().dataset.colorScheme).toBeUndefined()
  })

  // The choice is per device: stored locally and pinned on <html>, where `main.css` turns it into
  // `color-scheme` for every `light-dark()` role.
  it('pins and remembers a picked mode', async () => {
    const w = mount(ColorSchemeSwitch)

    await w.get('[data-test="color-scheme-dark"]').trigger('click')

    expect(pressed(w)).toEqual(['Dunkel'])
    expect(html().dataset.colorScheme).toBe('dark')
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark')
  })

  it('hands back to the system', async () => {
    const w = mount(ColorSchemeSwitch)

    await w.get('[data-test="color-scheme-light"]').trigger('click')
    await w.get('[data-test="color-scheme-system"]').trigger('click')

    expect(pressed(w)).toEqual(['System'])
    expect(html().dataset.colorScheme).toBeUndefined()
  })

  it('shows the stored choice', () => {
    localStorage.setItem(COLOR_SCHEME_KEY, 'light')

    expect(pressed(mount(ColorSchemeSwitch))).toEqual(['Hell'])
  })

  // A value from an older or foreign build must not leave the switch with nothing pressed.
  it('treats an unknown stored value as system', () => {
    localStorage.setItem(COLOR_SCHEME_KEY, 'sepia')

    expect(pressed(mount(ColorSchemeSwitch))).toEqual(['System'])
  })

  // 44px is the tap floor (frontend-ui.md).
  it('keeps each option at the tap floor', () => {
    for (const b of mount(ColorSchemeSwitch).findAll('button'))
      expect(b.classes()).toContain('h-11')
  })
})
