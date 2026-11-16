import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLOR_SCHEME_KEY, useDarkScheme } from '@/ui/colorScheme'

// The system's preference as `matchMedia` reports it; only the dark query can match.
function systemPrefersDark(dark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark && query.includes('dark'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

describe('useDarkScheme', () => {
  beforeEach(() => localStorage.clear())

  afterEach(() => {
    delete document.documentElement.dataset.colorScheme
    vi.restoreAllMocks()
  })

  it('follows the system while nothing is picked', () => {
    systemPrefersDark(true)
    expect(useDarkScheme().value).toBe(true)
  })

  // A pick outranks the system, in both directions.
  it('takes the user’s pick over the system', () => {
    systemPrefersDark(true)
    localStorage.setItem(COLOR_SCHEME_KEY, 'light')
    expect(useDarkScheme().value).toBe(false)

    systemPrefersDark(false)
    localStorage.setItem(COLOR_SCHEME_KEY, 'dark')
    expect(useDarkScheme().value).toBe(true)
  })
})
