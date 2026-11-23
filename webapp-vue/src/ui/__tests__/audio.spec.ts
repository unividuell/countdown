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

describe('decodingGraph', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is null without offline Web Audio', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined)
    const { decodingGraph } = await import('@/ui/audio')

    expect(decodingGraph()).toBeNull()
  })

  it('opens one offline graph, apart from the app’s live one', async () => {
    const live = vi.fn()
    vi.stubGlobal('AudioContext', live)
    vi.stubGlobal('OfflineAudioContext', class {})
    const { decodingGraph } = await import('@/ui/audio')

    expect(decodingGraph()).toBe(decodingGraph())
    expect(live).not.toHaveBeenCalled()
  })
})

/** A graph in `state`, as the one the app opens. */
function stubGraph(state: AudioContextState) {
  const resume = vi.fn(() => Promise.resolve())
  vi.stubGlobal(
    'AudioContext',
    class {
      state = state
      resume = resume
    },
  )

  return resume
}

describe('runningGraph', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is the graph while it runs', async () => {
    stubGraph('running')
    const { audioGraph, runningGraph } = await import('@/ui/audio')

    expect(runningGraph()).toBe(audioGraph())
  })

  it('is null while the graph sleeps, and without Web Audio', async () => {
    const { runningGraph: none } = await import('@/ui/audio')
    expect(none()).toBeNull()

    vi.resetModules()
    stubGraph('suspended')
    const { runningGraph } = await import('@/ui/audio')

    expect(runningGraph()).toBeNull()
  })
})

describe('unlockSound', () => {
  beforeEach(() => vi.resetModules())

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'audioSession')
  })

  it('asks a sleeping graph to wake', async () => {
    const resume = stubGraph('suspended')
    const { unlockSound } = await import('@/ui/audio')
    unlockSound()

    expect(resume).toHaveBeenCalledOnce()
  })

  it('leaves a running graph alone', async () => {
    const resume = stubGraph('running')
    const { unlockSound } = await import('@/ui/audio')
    unlockSound()

    expect(resume).not.toHaveBeenCalled()
  })

  // Chrome on iOS ignores the type and stops other audio anyway; elsewhere `auto` sounded as well.
  it('leaves the audio session type to the browser', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    const { unlockSound } = await import('@/ui/audio')
    unlockSound()

    expect(session.type).toBe('auto')
  })
})
