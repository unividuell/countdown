import { afterEach, describe, expect, it, vi } from 'vitest'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setHidden(false)
  })

  it('reports reduced motion when the media query matches', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    expect(prefersReducedMotion()).toBe(true)
  })

  it('reports no preference when the media query does not match', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)

    expect(prefersReducedMotion()).toBe(false)
  })

  it('survives window.matchMedia being absent altogether', () => {
    // happy-dom has it, but the guard exists for runtimes that do not — jsdom historically did not.
    // @ts-expect-error — deliberately removing it to exercise the guard
    delete window.matchMedia

    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('inBackground', () => {
  afterEach(() => {
    setHidden(false)
  })

  it('follows document.hidden', () => {
    setHidden(true)
    expect(inBackground()).toBe(true)

    setHidden(false)
    expect(inBackground()).toBe(false)
  })
})
