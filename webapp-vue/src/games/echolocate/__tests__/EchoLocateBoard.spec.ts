import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { StepView } from '@/api/types'
import EchoLocateBoard from '@/games/echolocate/EchoLocateBoard.vue'
import SonarField from '@/games/echolocate/SonarField.vue'
import { loadDraft, saveDraft } from '@/games/echolocate/draft'
import { shotsOf } from '@/games/echolocate/engine'
import type { EchoSounds } from '@/games/echolocate/engine'
import { dbToGain } from '@/games/echolocate/noise'
import type { EchoHit, EchoLocatePayload, Point } from '@/games/echolocate/types'
import HoldButton from '@/ui/HoldButton.vue'

/** A `Storage` over a map, handed to the board through `deviceStorage`. */
const storage = vi.hoisted(() => {
  const items = new Map<string, string>()

  return {
    items,
    fake: {
      get length() {
        return items.size
      },
      key: (i: number) => [...items.keys()][i] ?? null,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      clear: () => items.clear(),
    } as Storage,
  }
})

/** The graph and the engine, as the board sees them: what it scheduled, and when. */
const sound = vi.hoisted(() => {
  class FakeEngine {
    headStartMs = 120
    startBed = vi.fn()
    ping = vi.fn(() => 1500)
    hush = vi.fn()
    dispose = vi.fn()

    constructor() {
      engines.push(this)
    }
  }
  const engines: FakeEngine[] = []

  return {
    engines,
    FakeEngine,
    loadSounds: vi.fn(),
    ctx: { state: 'suspended', resume: vi.fn(() => Promise.resolve()) },
  }
})

vi.mock('@/games/drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/drafts')>()),
  deviceStorage: () => storage.fake,
}))

vi.mock('@/games/echolocate/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/echolocate/engine')>()),
  EchoEngine: sound.FakeEngine,
  loadSounds: sound.loadSounds,
}))

vi.mock('@/ui/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/audio')>()),
  audioGraph: () => sound.ctx,
}))

enableAutoUnmount(afterEach)

const PAYLOAD: EchoLocatePayload = {
  grid: 20,
  reach: 12,
  speed: 3,
  pings: 3,
  clips: 1,
  bedDb: -24,
  noiseDb: 0,
  toleranceCells: 1,
}
const KEY = 'echo-locate:draft:u1:0000abcd'
const SRC = 'blob:clip-0'

/** Mounted at 10 s; a wave starts 120 ms later and runs 4 s (12 cells at 3 a second). */
const NOW = 10_000
const START = NOW + 120
const TRAVEL_MS = 4000

const ANYWHERE: Point = { x: 10, y: 10 }
const A: Point = { x: 4, y: 5 }
const B: Point = { x: 15, y: 6 }
const C: Point = { x: 9, y: 16 }

const CLIP_HIT: EchoHit = { sound: 'CLIP', clip: 0, delayMs: 1000 }

const buffer = (name: string) => ({ name, duration: 1 }) as unknown as AudioBuffer

const NOISES: EchoSounds['noises'] = {
  BIRDS: buffer('birds'),
  BROOK: buffer('brook'),
  COW: buffer('cow'),
  WIND: buffer('wind'),
  RAIN: buffer('rain'),
}

function soundsFor(srcs: readonly (string | null)[]): EchoSounds & { bed: AudioBuffer } {
  return {
    bed: buffer('bed'),
    clips: srcs.map((src) => (src === null ? null : buffer(src))),
    noises: NOISES,
  }
}

const step = (at: Point, hits: EchoHit[] = []): StepView => ({ input: at, answer: { hits } })

/** The field is a stub unless a case needs its own cover and canvas. */
function mountBoard(over: Record<string, unknown> = {}, options: { realField?: boolean } = {}) {
  return mount(EchoLocateBoard, {
    props: {
      payload: PAYLOAD,
      steps: [],
      clipSrcs: [SRC],
      draftKey: null,
      disabled: false,
      awardRule: null,
      awardPoints: null,
      ...over,
    },
    global: { stubs: { HoldButton: true, SonarField: !options.realField } },
  })
}

type Board = ReturnType<typeof mountBoard>

const field = (w: Board) => w.findComponent(SonarField)
const hold = (w: Board) => w.findComponent(HoldButton)
const status = (w: Board) => w.get('[data-test="echo-locate-status"]')
const engine = () => sound.engines[0]!

/** A click on the field's cover. */
async function start(w: Board) {
  field(w).vm.$emit('start')
  await flushPromises()
}

async function tapAt(w: Board, at: Point, tMs = performance.now()) {
  field(w).vm.$emit('tap', at, tMs)
  await flushPromises()
}

/** The host while a ping is out: busy, then the round with the new step, then idle again. */
async function answer(w: Board, steps: StepView[]) {
  await w.setProps({ disabled: true })
  await w.setProps({ steps })
  await w.setProps({ disabled: false })
  await flushPromises()
}

async function confirm(w: Board) {
  hold(w).vm.$emit('confirm')
  await nextTick()
}

describe('EchoLocateBoard', () => {
  let now: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    storage.items.clear()
    sound.engines.length = 0
    sound.loadSounds.mockReset()
    sound.loadSounds.mockImplementation(async (_ctx: unknown, srcs: (string | null)[]) =>
      soundsFor(srcs),
    )
    sound.ctx.state = 'suspended'
    sound.ctx.resume.mockReset()
    sound.ctx.resume.mockImplementation(() => Promise.resolve())
    now = vi.spyOn(performance, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows how many clips hide in the field', () => {
    expect(mountBoard().text()).toContain('1 Spruch')
    expect(mountBoard({ payload: { ...PAYLOAD, clips: 2 } }).text()).toContain('2 Sprüche')
  })

  // iOS takes a click as a gesture, a touch's pointerdown not: only then may the graph start.
  it('unlocks the sound with a click on the cover, at once, and pings nothing', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })

    try {
      const w = mountBoard({}, { realField: true })
      expect(field(w).props('covered')).toBe(true)
      expect(status(w).text()).toBe('Antippen zum Starten')

      w.get<HTMLButtonElement>('button').element.click()

      // Inside the click, before anything awaits.
      expect(session.type).toBe('playback')
      expect(sound.ctx.resume).toHaveBeenCalledOnce()
      expect(sound.loadSounds).toHaveBeenCalledWith(sound.ctx, [SRC])

      await flushPromises()
      expect(sound.engines).toHaveLength(1)
      expect(engine().startBed).toHaveBeenCalledWith(buffer('bed'), dbToGain(-24))
      expect(w.emitted('skip')).toBeUndefined()
      expect(field(w).props('covered')).toBe(false)
      expect(status(w).text()).toBe('Ping + Markieren · noch 3')

      // A late second click, from before the cover went: opened already, it pings nothing.
      await start(w)
      expect(w.emitted('skip')).toBeUndefined()
      expect(status(w).text()).toBe('Ping + Markieren · noch 3')
      expect(sound.loadSounds).toHaveBeenCalledOnce()
    } finally {
      Reflect.deleteProperty(navigator, 'audioSession')
    }
  })

  it('does not unlock from a pointerdown on the closed field', async () => {
    const w = mountBoard({}, { realField: true })

    await w.get('button').trigger('pointerdown')
    await w.get('canvas').trigger('pointerdown')
    await flushPromises()

    expect(sound.ctx.resume).not.toHaveBeenCalled()
    expect(sound.loadSounds).not.toHaveBeenCalled()
    expect(w.emitted('skip')).toBeUndefined()
    expect(status(w).text()).toBe('Antippen zum Starten')
  })

  it('says so when the browser keeps the sound locked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    sound.ctx.resume.mockImplementation(() => Promise.reject(new Error('not allowed')))
    const w = mountBoard()

    await start(w)

    expect(warn).toHaveBeenCalledOnce()
    expect(status(w).text()).toBe('Ping + Markieren · noch 3')
  })

  it('pings with a skip carrying the spot', async () => {
    const w = mountBoard()
    await start(w)

    await tapAt(w, A)

    expect(w.emitted('skip')).toEqual([[0, A]])
    expect(field(w).props('pending')).toEqual(A)
    expect(status(w).text()).toBe('Sonar lädt …')
  })

  it("starts the wave once the step's answer arrives", async () => {
    const w = mountBoard()
    await start(w)
    engine().ping.mockReturnValue(5000)
    await tapAt(w, A)
    const hits: EchoHit[] = [CLIP_HIT, { sound: 'COW', clip: null, delayMs: 2000 }]

    await answer(w, [step(A, hits)])

    expect(engine().ping).toHaveBeenCalledWith(shotsOf(hits, soundsFor([SRC]), PAYLOAD.noiseDb))
    // The last sound ends after the wave has run out: marking lasts until then.
    expect(field(w).props('waves')).toEqual([{ at: A, startMs: START, endMs: START + 5000 }])
    expect(field(w).props('pending')).toBeNull()
    expect(status(w).text()).toBe('Markieren')
  })

  it('marks for as long as the wave runs when the sound ends sooner', async () => {
    const w = mountBoard()
    await start(w)
    await tapAt(w, A)

    await answer(w, [step(A)])

    expect(field(w).props('waves')).toEqual([{ at: A, startMs: START, endMs: START + TRAVEL_MS }])
  })

  it('waits for the sounds before a wave starts', async () => {
    let loaded: (sounds: EchoSounds & { bed: AudioBuffer }) => void = () => undefined
    sound.loadSounds.mockImplementation(() => new Promise((resolve) => (loaded = resolve)))
    const w = mountBoard()
    await start(w)
    await tapAt(w, A)

    await answer(w, [step(A, [CLIP_HIT])])
    expect(status(w).text()).toBe('Sonar lädt …')

    loaded(soundsFor([SRC]))
    await flushPromises()

    expect(engine().ping).toHaveBeenCalledOnce()
    expect(status(w).text()).toBe('Markieren')
  })

  it('ends the wave on time without a tap', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const w = mountBoard()
    await start(w)
    await tapAt(w, A)
    await answer(w, [step(A)])

    now.mockReturnValue(START + TRAVEL_MS)
    vi.advanceTimersByTime(START + TRAVEL_MS - NOW)
    await nextTick()

    expect(status(w).text()).toBe('Ping + Markieren · noch 2')
  })

  it('gives up a ping the server did not take', async () => {
    const w = mountBoard()
    await start(w)
    await tapAt(w, A)

    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(status(w).text()).toBe('Ping + Markieren · noch 3')
    expect(field(w).props('waves')).toEqual([])
    expect(field(w).props('pending')).toBeNull()
  })

  it('takes a ping the server counted in place of the open one, without a wave', async () => {
    const w = mountBoard()
    await start(w)
    await tapAt(w, B)

    // The answer to an earlier ping at A was lost; the reload after the 409 brings it.
    await answer(w, [step(A, [CLIP_HIT])])

    expect(engine().ping).not.toHaveBeenCalled()
    expect(field(w).props('waves')).toEqual([{ at: A, startMs: null, endMs: null }])
    expect(status(w).text()).toBe('Ping + Markieren · noch 2')
  })

  it('restores pings from the server and rings and pins from the draft', async () => {
    saveDraft(storage.fake, KEY, { rings: [[2.5], [], [4]], pins: [{ x: 3, y: 4 }] })

    const w = mountBoard({ steps: [step(A), step(B), step(C)], draftKey: KEY })

    expect(field(w).props('waves')).toEqual(
      [A, B, C].map((at) => ({ at, startMs: null, endMs: null })),
    )
    expect(field(w).props('rings')).toEqual([[2.5], [], [4]])
    expect(field(w).props('pins')).toEqual([{ x: 3, y: 4 }])

    await start(w)
    expect(status(w).text()).toBe('Schätzung · Pins 1/1')
    expect(engine().ping).not.toHaveBeenCalled()
  })

  it('holds to hand in exactly the pins and rings per ping', async () => {
    saveDraft(storage.fake, KEY, { rings: [[1.5], []], pins: [] })
    const w = mountBoard({ steps: [step(A), step(B)], draftKey: KEY })
    await start(w)
    await tapAt(w, C)
    await answer(w, [step(A), step(B), step(C, [CLIP_HIT])])

    // One second into the wave: 3 cells.
    await tapAt(w, ANYWHERE, START + 1000)
    expect(hold(w).props('disabled')).toBe(true)

    await tapAt(w, { x: 7, y: 8 }, START + 10_000)
    expect(hold(w).props('disabled')).toBe(false)

    await confirm(w)
    expect(w.emitted('guess')).toEqual([[{ pins: [{ x: 7, y: 8 }], rings: [[1.5], [], [3]] }]])
  })

  it('hands in nothing while disabled', async () => {
    saveDraft(storage.fake, KEY, { rings: [[], [], []], pins: [{ x: 3, y: 4 }] })
    const w = mountBoard({ steps: [step(A), step(B), step(C)], draftKey: KEY, disabled: true })

    await confirm(w)

    expect(hold(w).props('disabled')).toBe(true)
    expect(w.emitted('guess')).toBeUndefined()
  })

  it('ignores the cover and taps while disabled', async () => {
    const w = mountBoard({ disabled: true })

    await start(w)
    expect(sound.loadSounds).not.toHaveBeenCalled()
    expect(status(w).text()).toBe('Antippen zum Starten')

    await w.setProps({ disabled: false })
    await start(w)
    await w.setProps({ disabled: true })
    await tapAt(w, A)
    expect(w.emitted('skip')).toBeUndefined()
  })

  it('saves rings and pins as a draft', async () => {
    const w = mountBoard({ payload: { ...PAYLOAD, pings: 1 }, draftKey: KEY })
    await start(w)
    await tapAt(w, A)
    await answer(w, [step(A, [CLIP_HIT])])

    await tapAt(w, ANYWHERE, START + 2000)
    expect(loadDraft(storage.fake, KEY, PAYLOAD)).toEqual({ rings: [[6]], pins: [] })

    await tapAt(w, B, START + 10_000)
    expect(loadDraft(storage.fake, KEY, PAYLOAD)).toEqual({ rings: [[6]], pins: [B] })
  })

  it('keeps no draft without a key', async () => {
    const w = mountBoard()
    await start(w)
    await tapAt(w, A)

    expect(storage.items.size).toBe(0)
  })

  it('stays silent at a missing clip', async () => {
    const w = mountBoard({ clipSrcs: [null] })
    await start(w)
    await tapAt(w, A)

    await answer(w, [step(A, [CLIP_HIT])])

    expect(sound.loadSounds).toHaveBeenCalledWith(sound.ctx, [null])
    expect(engine().ping).toHaveBeenCalledWith([])
    expect(status(w).text()).toBe('Markieren')
  })

  it('picks up a clip that arrives after the start', async () => {
    const w = mountBoard({ clipSrcs: [null] })
    await start(w)

    await w.setProps({ clipSrcs: [SRC] })
    await flushPromises()
    await tapAt(w, A)
    await answer(w, [step(A, [CLIP_HIT])])

    expect(sound.engines).toHaveLength(1)
    expect(engine().startBed).toHaveBeenCalledOnce()
    expect(engine().ping).toHaveBeenCalledWith(
      shotsOf([CLIP_HIT], soundsFor([SRC]), PAYLOAD.noiseDb),
    )
  })

  it('stops its sound when it goes', async () => {
    const w = mountBoard()
    await start(w)

    w.unmount()

    expect(engine().dispose).toHaveBeenCalledOnce()
  })

  it('starts no sound once gone, though the sounds arrive late', async () => {
    let loaded: (sounds: EchoSounds & { bed: AudioBuffer }) => void = () => undefined
    sound.loadSounds.mockImplementation(() => new Promise((resolve) => (loaded = resolve)))
    const w = mountBoard()
    await start(w)

    w.unmount()
    loaded(soundsFor([SRC]))
    await flushPromises()

    expect(sound.engines).toHaveLength(0)
  })

  it('states the tolerance in the award box, in its headline too', () => {
    const w = mountBoard({ awardRule: 'ALL_QUALIFYING', awardPoints: 1 })

    expect(w.text()).toContain('Irgendwo im Nebel steckt ein Spruch. Peil ihn an.')
    expect(w.text()).toContain('Jeder gültige Tipp: 1 Punkt · ±1 Zelle')
    expect(w.text()).toContain(
      'Jeder Pin muss in der Zelle seines Spruchs liegen oder in einer der acht daneben.',
    )
  })

  it('keeps the status line live for screen readers', () => {
    expect(status(mountBoard()).attributes('aria-live')).toBe('polite')
  })
})
