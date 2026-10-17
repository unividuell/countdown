import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('audioGraph', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is null without Web Audio', async () => {
    const { audioGraph } = await import('@/ui/audio')

    expect(audioGraph()).toBeNull()
  })

  it('opens one graph for the whole app', async () => {
    const created: unknown[] = []
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          created.push(this)
        }
      },
    )
    const { audioGraph } = await import('@/ui/audio')

    expect(audioGraph()).toBe(audioGraph())
    expect(created).toHaveLength(1)
  })
})
