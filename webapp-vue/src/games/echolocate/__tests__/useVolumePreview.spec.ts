import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { runningGraph } from '@/ui/audio'
import { PROBE_MS, useVolumePreview } from '@/games/echolocate/useVolumePreview'

const engines: {
  startBed: ReturnType<typeof vi.fn>
  stopBed: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}[] = []

vi.mock('@/ui/audio', () => ({ runningGraph: vi.fn() }))
vi.mock('@/games/echolocate/noise', () => ({ bedSamples: () => new Float32Array(4) }))
vi.mock('@/games/echolocate/engine', () => ({
  bufferOf: () => ({ name: 'bed' }),
  EchoEngine: class {
    startBed = vi.fn()
    stopBed = vi.fn()
    dispose = vi.fn()
    constructor() {
      engines.push(this)
    }
  },
}))

enableAutoUnmount(afterEach)

function withPreview(): { onAdjust: () => void; unmount: () => void } {
  let onAdjust!: () => void
  const w = mount(
    defineComponent({
      setup() {
        onAdjust = useVolumePreview().onAdjust
        return () => null
      },
    }),
  )

  return { onAdjust, unmount: () => w.unmount() }
}

describe('useVolumePreview', () => {
  beforeEach(() => {
    engines.length = 0
    localStorage.clear()
    vi.mocked(runningGraph).mockClear()
    vi.useFakeTimers()
    vi.mocked(runningGraph).mockReturnValue({ sampleRate: 48000 } as AudioContext)
  })

  afterEach(() => vi.useRealTimers())

  // Gain 1, not the round's bed level: the sayings come at full level, and that is what to judge by.
  it('plays the bed at the sayings level while the slider moves', () => {
    const { onAdjust } = withPreview()

    onAdjust()
    onAdjust()

    expect(engines).toHaveLength(1)
    expect(engines[0]!.startBed).toHaveBeenCalledWith({ name: 'bed' }, 1)
  })

  it('falls silent a moment after the last move', () => {
    const { onAdjust } = withPreview()

    onAdjust()
    vi.advanceTimersByTime(PROBE_MS - 1)
    onAdjust()
    vi.advanceTimersByTime(PROBE_MS - 1)
    expect(engines[0]!.stopBed).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(engines[0]!.stopBed).toHaveBeenCalledOnce()
  })

  it('stays silent on a sleeping graph: a probe that lands later belongs to nothing', () => {
    vi.mocked(runningGraph).mockReturnValue(null)
    const { onAdjust } = withPreview()

    onAdjust()

    expect(engines).toHaveLength(0)
  })

  // Muted asks for no graph: a running one claims the device's audio session.
  it('plays nothing at zero', () => {
    localStorage.setItem('games:volume', '0')
    const { onAdjust } = withPreview()

    onAdjust()

    expect(runningGraph).not.toHaveBeenCalled()
    expect(engines).toHaveLength(0)
  })

  it('lets go of its engine when the controls go away', () => {
    const { onAdjust, unmount } = withPreview()
    onAdjust()

    unmount()

    expect(engines[0]!.dispose).toHaveBeenCalled()
  })
})
