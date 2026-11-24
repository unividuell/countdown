import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { GAME_VOLUME_KEY } from '@/ui/useGameVolume'

function graph() {
  const ramp = vi.fn()
  const node = {
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: ramp },
    to: null as unknown,
    connect(to: unknown) {
      node.to = to
      return to
    },
  }
  const created: (typeof node)[] = []
  const g = {
    currentTime: 5,
    destination: { name: 'destination' },
    createGain: () => {
      created.push(node)
      return node
    },
  }

  return { g: g as unknown as AudioContext, node, ramp, created }
}

/** Module state: one master per graph. A fresh copy per case. */
async function load() {
  const { masterOutput } = await import('@/ui/masterOutput')
  const { useGameVolume } = await import('@/ui/useGameVolume')

  return { masterOutput, useGameVolume }
}

describe('masterOutput', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('is one gain per graph, in front of the destination, at the default volume squared', async () => {
    const { g, node, created } = graph()
    const { masterOutput } = await load()

    expect(masterOutput(g)).toBe(masterOutput(g))
    expect(created).toHaveLength(1)
    expect(node.to).toBe(g.destination)
    expect(node.gain.value).toBeCloseTo(0.64)
  })

  it('starts silent on a stored zero', async () => {
    localStorage.setItem(GAME_VOLUME_KEY, '0')
    const { g, node } = graph()
    const { masterOutput } = await load()
    masterOutput(g)

    expect(node.gain.value).toBe(0)
  })

  it('follows the volume with a short ramp: what is sounding changes too', async () => {
    const { g, ramp } = graph()
    const { masterOutput, useGameVolume } = await load()
    masterOutput(g)

    useGameVolume().value = 0.5
    await nextTick()
    await nextTick()

    expect(ramp).toHaveBeenLastCalledWith(0.25, expect.closeTo(5.02))
  })
})
