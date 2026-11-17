import { afterEach, describe, expect, it } from 'vitest'
import { SURFACE_CONTAINER, useSurfaceContainer } from '@/ui/surfaceTone'

describe('useSurfaceContainer', () => {
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.colorScheme
  })

  // Twin of `--color-surface-container` in main.css, for what is painted outside CSS.
  it('holds the role’s two values', () => {
    expect(SURFACE_CONTAINER).toEqual({ light: '#f5f5f5', dark: '#2a2826' })
  })

  it('answers the tone of the mode in force', () => {
    localStorage.setItem('color-scheme', 'dark')
    expect(useSurfaceContainer().value).toBe('#2a2826')

    localStorage.setItem('color-scheme', 'light')
    expect(useSurfaceContainer().value).toBe('#f5f5f5')
  })
})
