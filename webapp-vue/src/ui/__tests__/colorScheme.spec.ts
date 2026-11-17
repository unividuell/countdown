import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { COLOR_SCHEME_KEY, useColorSchemeShortcut, useDarkScheme } from '@/ui/colorScheme'

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

describe('useColorSchemeShortcut', () => {
  let host: VueWrapper | undefined

  function mountShortcut(): void {
    host = mount(defineComponent({ setup: () => useColorSchemeShortcut(), template: '<div />' }), {
      attachTo: document.body,
    })
  }

  async function press(init: KeyboardEventInit, target: EventTarget = document): Promise<void> {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
    await nextTick()
  }

  beforeEach(() => localStorage.clear())

  afterEach(() => {
    host?.unmount()
    document.body.innerHTML = ''
    delete document.documentElement.dataset.colorScheme
    vi.restoreAllMocks()
  })

  // From the scheme in force, not from the stored pick: „system“ on a dark OS goes light.
  it('flips to the scheme not in force on P', async () => {
    systemPrefersDark(true)
    mountShortcut()

    await press({ key: 'p' })
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('light')
    expect(document.documentElement.dataset.colorScheme).toBe('light')

    await press({ key: 'P' })
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark')
    expect(document.documentElement.dataset.colorScheme).toBe('dark')
  })

  it('leaves modified, held and typed keys alone', async () => {
    systemPrefersDark(false)
    mountShortcut()
    const input = document.body.appendChild(document.createElement('input'))

    await press({ key: 'p', metaKey: true })
    await press({ key: 'p', shiftKey: true })
    await press({ key: 'p', repeat: true })
    await press({ key: 'p' }, input)

    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('system')
    expect(document.documentElement.dataset.colorScheme).toBeUndefined()
  })
})
