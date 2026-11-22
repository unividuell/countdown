import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runOut } from '@/ui/ramp/poster'

const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')

afterEach(() => {
  if (saved) Object.defineProperty(Element.prototype, 'animate', saved)
  else delete (Element.prototype as { animate?: unknown }).animate
})

describe('runOut', () => {
  beforeEach(() => {
    // A cancelled animation: its `finished` rejects, as when the poster unmounts mid-run.
    Object.defineProperty(Element.prototype, 'animate', {
      value: vi.fn(() => ({
        finished: Promise.reject(new DOMException('cancelled', 'AbortError')),
      })),
      configurable: true,
      writable: true,
    })
  })

  it('treats a cancelled animation as finished', async () => {
    const el = document.createElement('div')

    await expect(runOut([{ el, right: true, rank: 0 }])).resolves.toBeUndefined()
  })

  it('still raises any other failure', async () => {
    Object.defineProperty(Element.prototype, 'animate', {
      value: () => ({ finished: Promise.reject(new Error('boom')) }),
      configurable: true,
      writable: true,
    })
    const el = document.createElement('div')

    await expect(runOut([{ el, right: true, rank: 0 }])).rejects.toThrow('boom')
  })
})
