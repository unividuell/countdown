import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * The composable keeps the graph and the „only one clip sounds" registry in module state, so every
 * test gets a fresh module — otherwise a context stubbed in one case would still be the shared one
 * in the next.
 */
type Playback = ReturnType<typeof import('@/ui/usePlayback').usePlayback>

const CLIP_SECONDS = 0.1

/** How long every decoded clip lasts; a case that needs room to seek in sets it longer. */
let decodeSeconds = CLIP_SECONDS
function clipsLast(seconds: number): void {
  decodeSeconds = seconds
}

class FakeNode {
  buffer: unknown = null
  onended: (() => void) | null = null
  startedAt: number | null = null
  offset = 0
  stopped = false
  stoppedAt: number | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start(when: number, offset = 0): void {
    this.startedAt = when
    this.offset = offset
  }
  stop(when?: number): void {
    this.stopped = true
    this.stoppedAt = when ?? null
  }
}

class FakeContext {
  static instances: FakeContext[] = []
  state = 'suspended'
  currentTime = 10
  destination = { name: 'speakers' }
  nodes: FakeNode[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  decodeAudioData = vi.fn(async (): Promise<{ duration: number }> => ({ duration: decodeSeconds }))
  constructor() {
    FakeContext.instances.push(this)
  }
  createBufferSource(): FakeNode {
    const node = new FakeNode()
    this.nodes.push(node)
    return node
  }
}

/** rAF is driven by hand: `sample()` re-requests itself, so a test runs exactly one frame. */
let frames: FrameRequestCallback[] = []
function runFrame(): void {
  const next = frames.shift()
  frames = []
  next?.(0)
}

/** The composable belongs to a component — `onUnmounted` is how it lets go of its source. */
function withPlayback(usePlayback: () => Playback): {
  playback: Playback
  unmount: () => void
} {
  let playback!: Playback
  const wrapper = mount(
    defineComponent({
      setup() {
        playback = usePlayback()
        return () => h('div')
      },
    }),
  )
  return { playback, unmount: () => wrapper.unmount() }
}

/** Two microtask turns: the resume, then the decode. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

let usePlayback: () => Playback
let play: ReturnType<typeof vi.spyOn>

async function loadModule(): Promise<void> {
  vi.resetModules()
  usePlayback = (await import('@/ui/usePlayback')).usePlayback
}

beforeEach(async () => {
  FakeContext.instances = []
  decodeSeconds = CLIP_SECONDS
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
  )
  play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  await loadModule()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('usePlayback with an audio graph', () => {
  beforeEach(async () => {
    vi.stubGlobal('AudioContext', FakeContext)
    await loadModule()
  })

  function context(): FakeContext {
    return FakeContext.instances[0]!
  }

  it('plays the clip through the graph, scheduled a hair into the future', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()

    const ctx = context()
    expect(fetch).toHaveBeenCalledWith('blob:stage-0')
    expect(ctx.resume).toHaveBeenCalled()
    const node = ctx.nodes[0]!
    expect(node.buffer).toEqual({ duration: CLIP_SECONDS })
    expect(node.connect).toHaveBeenCalledWith(ctx.destination)
    // Not „now": the first samples of a clip started in the present can be dropped.
    expect(node.startedAt).toBeCloseTo(10.05)
    expect(playback.playing.value).toBe(true)
    // Nothing has been heard yet — the clip is still ahead.
    expect(playback.positionSeconds.value).toBe(0)
  })

  it('reads the position off the graph clock, silent through the lookahead and capped at the clip', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()
    const ctx = context()

    ctx.currentTime = 10.04
    runFrame()
    expect(playback.positionSeconds.value).toBe(0)

    ctx.currentTime = 10.09
    runFrame()
    expect(playback.positionSeconds.value).toBeCloseTo(0.04)

    ctx.currentTime = 11
    runFrame()
    expect(playback.positionSeconds.value).toBe(CLIP_SECONDS)
  })

  it('fills the position to the clip when the graph reports the end', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()

    context().nodes[0]!.onended?.()

    expect(playback.playing.value).toBe(false)
    expect(playback.positionSeconds.value).toBe(CLIP_SECONDS)
  })

  it('stops the node on pause and keeps what was heard', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()
    const ctx = context()
    ctx.currentTime = 10.11

    playback.pause()

    expect(ctx.nodes[0]!.stopped).toBe(true)
    expect(playback.playing.value).toBe(false)
    expect(playback.positionSeconds.value).toBeCloseTo(0.06)
  })

  it('starts mid-clip where asked, and reports that spot as heard', async () => {
    const { playback } = withPlayback(usePlayback)
    clipsLast(2)
    playback.setSource('blob:stage-2')
    playback.play(0.5)
    await settle()
    const ctx = context()

    const node = ctx.nodes[0]!
    expect(node.offset).toBe(0.5)
    expect(playback.positionSeconds.value).toBe(0.5)

    // Through the lookahead the position stands still at the start, never behind it.
    ctx.currentTime = 10.02
    runFrame()
    expect(playback.positionSeconds.value).toBe(0.5)

    ctx.currentTime = 10.55
    runFrame()
    expect(playback.positionSeconds.value).toBeCloseTo(1)
  })

  it('resumes from where a pause left off', async () => {
    const { playback } = withPlayback(usePlayback)
    clipsLast(2)
    playback.setSource('blob:stage-2')
    playback.restart()
    await settle()
    const ctx = context()
    ctx.currentTime = 10.85
    playback.pause()

    playback.resume()
    await settle()

    expect(ctx.nodes[1]!.offset).toBeCloseTo(0.8)
  })

  it('resumes from the start once the clip has played out', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()
    context().nodes[0]!.onended?.()

    playback.resume()
    await settle()

    expect(context().nodes[1]!.offset).toBe(0)
  })

  it('stops back to the start: the bar empties and a resume starts over', async () => {
    const { playback } = withPlayback(usePlayback)
    clipsLast(2)
    playback.setSource('blob:stage-2')
    playback.restart()
    await settle()
    const ctx = context()
    ctx.currentTime = 10.85

    playback.stop()

    expect(ctx.nodes[0]!.stopped).toBe(true)
    expect(playback.playing.value).toBe(false)
    expect(playback.positionSeconds.value).toBe(0)

    playback.resume()
    await settle()
    expect(ctx.nodes[1]!.offset).toBe(0)
  })

  it('hands a sounding clip over to the longer one without a break, at the spot it reached', async () => {
    const { playback } = withPlayback(usePlayback)
    clipsLast(0.5)
    playback.setSource('blob:stage-1')
    playback.restart()
    await settle()
    const ctx = context()
    ctx.currentTime = 10.35

    ctx.decodeAudioData.mockResolvedValueOnce({ duration: 2 })
    playback.extend('blob:stage-2')
    await settle()

    const [old, longer] = ctx.nodes
    expect(fetch).toHaveBeenLastCalledWith('blob:stage-2')
    // The old one ends exactly where the new one picks up — the graph schedules both.
    expect(old!.stoppedAt).toBeCloseTo(10.4)
    expect(longer!.startedAt).toBeCloseTo(10.4)
    expect(longer!.offset).toBeCloseTo(0.35)
    expect(playback.playing.value).toBe(true)

    ctx.currentTime = 11.4
    runFrame()
    expect(playback.positionSeconds.value).toBeCloseTo(1.35)
  })

  it('plays on past the end of a clip that ran out before the longer one arrived', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()
    const ctx = context()

    let decoded: (buffer: { duration: number }) => void = () => {}
    ctx.decodeAudioData.mockReturnValueOnce(
      new Promise((resolve) => {
        decoded = resolve
      }),
    )
    playback.extend('blob:stage-1')
    ctx.nodes[0]!.onended?.()
    // Still „playing": the button must not flip back to play inside the handover.
    expect(playback.playing.value).toBe(true)

    ctx.currentTime = 11
    decoded({ duration: 0.5 })
    await settle()

    expect(ctx.nodes[1]!.offset).toBe(CLIP_SECONDS)
  })

  it('lets a pause reach a handover that is still decoding — and resume into the longer clip', async () => {
    const { playback } = withPlayback(usePlayback)
    clipsLast(0.5)
    playback.setSource('blob:stage-1')
    playback.restart()
    await settle()
    const ctx = context()
    ctx.currentTime = 10.25

    ctx.decodeAudioData.mockResolvedValueOnce({ duration: 2 })
    playback.extend('blob:stage-2')
    playback.pause()
    await settle()

    expect(ctx.nodes).toHaveLength(1)
    expect(playback.playing.value).toBe(false)

    playback.resume()
    await settle()
    expect(ctx.nodes[1]!.buffer).toEqual({ duration: 2 })
    expect(ctx.nodes[1]!.offset).toBeCloseTo(0.2)
  })

  it('lets a second player silence the first, since only one clip may sound', async () => {
    const first = withPlayback(usePlayback)
    const second = withPlayback(usePlayback)
    first.playback.setSource('blob:solution')
    first.playback.restart()
    await settle()
    second.playback.setSource('blob:guess')
    second.playback.restart()
    await settle()

    expect(first.playback.playing.value).toBe(false)
    expect(second.playback.playing.value).toBe(true)
    expect(context().nodes[0]!.stopped).toBe(true)
  })

  it('drops a start still waiting on its decode when a newer source arrives', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    playback.setSource('blob:stage-1')
    await settle()

    // The first start awoke into a world with a newer source; it must not have taken the graph.
    expect(context().nodes).toHaveLength(0)
    expect(playback.playing.value).toBe(false)
  })

  it('lets a pause reach a start that is still on its way', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()

    // Tapped pause while the decode was still out — a real window on a phone, where the reveal's
    // first tap waits on a fetch and a decode before anything sounds.
    playback.pause()
    await settle()

    expect(context().nodes).toHaveLength(0)
    expect(playback.playing.value).toBe(false)
  })

  it('falls back to the element for a clip the decoder refuses', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:broken')
    context().decodeAudioData.mockRejectedValueOnce(new Error('unsupported'))
    playback.restart()
    await settle()

    expect(play).toHaveBeenCalled()
    expect(context().nodes).toHaveLength(0)
  })

  it('stays silent for good once disposed, however late its own fetch lands', async () => {
    const { playback, unmount } = withPlayback(usePlayback)
    unmount()

    // What a stage fetch that outlived the board does when it finally resolves.
    playback.setSource('blob:stage-4')
    playback.restart()
    await settle()

    expect(FakeContext.instances).toHaveLength(0)
    expect(play).not.toHaveBeenCalled()
    expect(playback.playing.value).toBe(false)
  })

  it('lets go of the clip when its component goes away', async () => {
    const { playback, unmount } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()

    unmount()

    expect(context().nodes[0]!.stopped).toBe(true)
    expect(playback.playing.value).toBe(false)
  })
})

describe('usePlayback without an audio graph', () => {
  it('plays through the element where no AudioContext exists', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()

    expect(play).toHaveBeenCalled()
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('does not seek an element that already stands at the start', async () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-0')
    const seek = vi.spyOn(window.HTMLMediaElement.prototype, 'currentTime', 'set')

    playback.restart()

    expect(seek).not.toHaveBeenCalled()
  })

  it('seeks the element to where a play is asked to start', () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-2')
    const seek = vi.spyOn(window.HTMLMediaElement.prototype, 'currentTime', 'set')

    playback.play(0.5)

    expect(seek).toHaveBeenCalledWith(0.5)
    expect(play).toHaveBeenCalled()
  })

  it('hands a sounding element over to the longer clip at the spot it reached', () => {
    const { playback } = withPlayback(usePlayback)
    playback.setSource('blob:stage-1')
    playback.restart()
    playback.playing.value = true
    vi.spyOn(window.HTMLMediaElement.prototype, 'currentTime', 'get').mockReturnValue(0.3)
    const seek = vi.spyOn(window.HTMLMediaElement.prototype, 'currentTime', 'set')

    playback.extend('blob:stage-2')

    expect(seek).toHaveBeenCalledWith(0.3)
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('says out loud when the browser refuses to play — that is what silence looks like', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    play.mockRejectedValueOnce(new Error('NotAllowedError'))
    const { playback } = withPlayback(usePlayback)

    playback.setSource('blob:stage-0')
    playback.restart()
    await settle()

    expect(warn).toHaveBeenCalledWith(
      '[playback] the browser refused to play the clip',
      expect.any(Error),
    )
  })
})
