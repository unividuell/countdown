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
    stopBed = vi.fn()
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
    ctx: Object.assign(new EventTarget(), {
      state: 'suspended' as string,
      resume: vi.fn(() => Promise.resolve()),
      suspend: vi.fn(() => Promise.resolve()),
    }),
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
  toleranceRadius: 1.5,
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
      myColorHex: '#7c3aed',
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

/** The graph stops on its own, as iOS does it for a call, an app switch or the lock screen. */
async function interrupt() {
  sound.ctx.state = 'interrupted'
  sound.ctx.dispatchEvent(new Event('statechange'))
  await nextTick()
}

/** The page goes to the background, or comes back. */
async function showPage(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
}

/** A short click, told on release with the time the finger came down. */
async function tapAt(w: Board, at: Point, tMs = performance.now()) {
  field(w).vm.$emit('tap', at, tMs)
  await flushPromises()
}

/** A long click. */
async function holdAt(w: Board, at: Point) {
  field(w).vm.$emit('hold', at)
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
    sound.ctx.resume.mockImplementation(() => {
      sound.ctx.state = 'running'
      return Promise.resolve()
    })
    sound.ctx.suspend.mockClear()
    now = vi.spyOn(performance, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('hands the field the count to name until the first ping', () => {
    expect(field(mountBoard()).props('clips')).toBe(1)
    expect(field(mountBoard({ payload: { ...PAYLOAD, clips: 2 } })).props('clips')).toBe(2)
  })

  it('draws my pins in my colour', () => {
    expect(field(mountBoard({ myColorHex: '#0ea5e9' })).props('pinColorHex')).toBe('#0ea5e9')
  })

  it('says from the start what a click does, and how a pin is set', () => {
    const w = mountBoard()

    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')
    expect(w.get('[data-test="echo-locate-pin-hint"]').text()).toBe(
      'Lang drücken: Pin setzen oder entfernen',
    )
  })

  // No cover: the release of the first click is the gesture iOS needs, and it pings at once.
  it('starts the sound with the first click and pings in the same click', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })

    try {
      const w = mountBoard()

      await tapAt(w, A)

      expect(session.type).toBe('playback')
      expect(sound.ctx.resume).toHaveBeenCalledOnce()
      expect(sound.loadSounds).toHaveBeenCalledWith(sound.ctx, [SRC])
      expect(w.emitted('skip')).toEqual([[0, A]])
      expect(sound.engines).toHaveLength(1)
      expect(engine().startBed).toHaveBeenCalledWith(buffer('bed'), dbToGain(-24))
    } finally {
      Reflect.deleteProperty(navigator, 'audioSession')
    }
  })

  it('loads the sounds once, whatever clicks follow', async () => {
    const w = mountBoard()

    await tapAt(w, A)
    await answer(w, [step(A)])
    await tapAt(w, ANYWHERE, START + 1000)

    expect(sound.loadSounds).toHaveBeenCalledOnce()
    expect(sound.engines).toHaveLength(1)
  })

  it('pings even when the browser keeps the sound locked, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    sound.ctx.resume.mockImplementation(() => Promise.reject(new Error('not allowed')))
    const w = mountBoard()

    await tapAt(w, A)

    expect(warn).toHaveBeenCalledOnce()
    expect(w.emitted('skip')).toEqual([[0, A]])
  })

  it('resumes a graph iOS suspended with the next click', async () => {
    const w = mountBoard({ steps: [step(A)] })
    await tapAt(w, B)
    await answer(w, [step(A), step(B)])

    await interrupt()
    await tapAt(w, ANYWHERE, START + 10_000)

    expect(sound.ctx.resume).toHaveBeenCalledTimes(2)
  })

  it('stops the bed while the page is hidden and starts it again when it shows', async () => {
    const w = mountBoard()
    await tapAt(w, A)

    await showPage('hidden')
    expect(engine().stopBed).toHaveBeenCalledOnce()

    await showPage('visible')
    await flushPromises()
    expect(engine().startBed).toHaveBeenCalledTimes(2)
    // Other games share the graph: it is never suspended from here.
    expect(sound.ctx.suspend).not.toHaveBeenCalled()
  })

  // iOS may still read „interrupted“ when the page shows, and run again only later.
  it('starts the bed again when the sound runs again', async () => {
    const w = mountBoard()
    await tapAt(w, A)

    await showPage('hidden')
    await interrupt()
    await showPage('visible')
    await flushPromises()
    expect(engine().startBed).toHaveBeenCalledOnce()

    sound.ctx.state = 'running'
    sound.ctx.dispatchEvent(new Event('statechange'))
    await flushPromises()
    expect(engine().startBed).toHaveBeenCalledTimes(2)
  })

  it('lets go of the graph and the page when it goes', async () => {
    const fromGraph = vi.spyOn(sound.ctx, 'removeEventListener')
    const fromPage = vi.spyOn(document, 'removeEventListener')
    const w = mountBoard()
    await tapAt(w, A)

    w.unmount()

    expect(fromGraph.mock.calls.map(([type]) => type)).toContain('statechange')
    expect(fromPage.mock.calls.map(([type]) => type)).toContain('visibilitychange')
  })

  it('pings with a skip carrying the spot', async () => {
    const w = mountBoard()

    await tapAt(w, A)

    expect(w.emitted('skip')).toEqual([[0, A]])
    expect(field(w).props('pending')).toEqual(A)
    expect(status(w).text()).toBe('Sonar lädt …')
  })

  it("starts the wave once the step's answer arrives", async () => {
    const w = mountBoard()
    await tapAt(w, A)
    engine().ping.mockReturnValue(5000)
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
    await tapAt(w, A)

    await answer(w, [step(A)])

    expect(field(w).props('waves')).toEqual([{ at: A, startMs: START, endMs: START + TRAVEL_MS }])
  })

  it('waits for the sounds before a wave starts', async () => {
    let loaded: (sounds: EchoSounds & { bed: AudioBuffer }) => void = () => undefined
    sound.loadSounds.mockImplementation(() => new Promise((resolve) => (loaded = resolve)))
    const w = mountBoard()
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
    await tapAt(w, A)
    await answer(w, [step(A)])

    now.mockReturnValue(START + TRAVEL_MS)
    vi.advanceTimersByTime(START + TRAVEL_MS - NOW)
    await nextTick()

    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')
  })

  it('gives up a ping the server did not take', async () => {
    const w = mountBoard()
    await tapAt(w, A)

    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')
    expect(field(w).props('waves')).toEqual([])
    expect(field(w).props('pending')).toBeNull()
  })

  it('takes a ping the server counted in place of the open one, without a wave', async () => {
    const w = mountBoard()
    await tapAt(w, B)

    // The answer to an earlier ping at A was lost; the reload after the 409 brings it.
    await answer(w, [step(A, [CLIP_HIT])])

    expect(engine().ping).not.toHaveBeenCalled()
    expect(field(w).props('waves')).toEqual([{ at: A, startMs: null, endMs: null }])
    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')
  })

  it('restores pings from the server and rings and pins from the draft', async () => {
    saveDraft(storage.fake, KEY, { rings: [[2.5], [], [4]], pins: [{ x: 3, y: 4 }] })

    const w = mountBoard({ steps: [step(A), step(B), step(C)], draftKey: KEY })

    expect(field(w).props('waves')).toEqual(
      [A, B, C].map((at) => ({ at, startMs: null, endMs: null })),
    )
    expect(field(w).props('rings')).toEqual([[2.5], [], [4]])
    expect(field(w).props('pins')).toEqual([{ x: 3, y: 4 }])
    expect(sound.loadSounds).not.toHaveBeenCalled()
  })

  // The lab's reset and „forget mine“ keep the board and empty its steps; a real round never does.
  it('starts over, still open, when the server takes my pings back', async () => {
    saveDraft(storage.fake, KEY, { rings: [[2.5], []], pins: [] })
    const w = mountBoard({ steps: [step(A), step(B)], draftKey: KEY })

    await w.setProps({ steps: [] })

    expect(field(w).props('waves')).toEqual([])
    expect(field(w).props('rings')).toEqual([])
    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')

    await tapAt(w, C)
    expect(w.emitted('skip')).toEqual([[0, C]])
  })

  it('silences the answer of a ping taken back', async () => {
    const w = mountBoard()
    await tapAt(w, A)
    await answer(w, [step(A, [CLIP_HIT])])

    await w.setProps({ steps: [] })

    expect(engine().hush).toHaveBeenCalledOnce()
    expect(status(w).text()).toBe('1. Klick: Ping, 2. Klick: Markieren')
  })

  // A lab phase switch keeps the board and changes its key.
  it('takes the draft under a new key', async () => {
    const other = 'echo-locate:draft:u1:ffff0000'
    saveDraft(storage.fake, other, { rings: [[4]], pins: [] })
    const w = mountBoard({ steps: [step(A)], draftKey: KEY })
    expect(field(w).props('rings')).toEqual([[]])

    await w.setProps({ draftKey: other })

    expect(field(w).props('rings')).toEqual([[4]])
  })

  // The lab hands over a phase's key and pings in one render, as the round brings both.
  it('keeps the draft of a new key that comes with more pings', async () => {
    const other = 'echo-locate:draft:u1:ffff0000'
    const draft = { rings: [[1], [2], [3]], pins: [{ x: 3, y: 4 }] }
    saveDraft(storage.fake, other, draft)
    const w = mountBoard({ steps: [], draftKey: KEY })

    await w.setProps({ draftKey: other, steps: [step(A), step(B), step(C)] })

    expect(field(w).props('waves')).toEqual(
      [A, B, C].map((at) => ({ at, startMs: null, endMs: null })),
    )
    expect(field(w).props('rings')).toEqual(draft.rings)
    expect(field(w).props('pins')).toEqual(draft.pins)
    expect(loadDraft(storage.fake, other, PAYLOAD)).toEqual(draft)
  })

  it('takes the pings of a new key that comes with as many', async () => {
    const other = 'echo-locate:draft:u1:ffff0000'
    saveDraft(storage.fake, other, { rings: [[4]], pins: [] })
    const w = mountBoard({ steps: [step(A)], draftKey: KEY })

    await w.setProps({ draftKey: other, steps: [step(C)] })

    expect(field(w).props('waves')).toEqual([{ at: C, startMs: null, endMs: null }])
    expect(field(w).props('rings')).toEqual([[4]])
    expect(loadDraft(storage.fake, other, PAYLOAD)).toEqual({ rings: [[4]], pins: [] })
  })

  it('holds to hand in exactly the pins and rings per ping', async () => {
    saveDraft(storage.fake, KEY, { rings: [[1.5], []], pins: [] })
    const w = mountBoard({ steps: [step(A), step(B)], draftKey: KEY })
    await tapAt(w, C)
    await answer(w, [step(A), step(B), step(C, [CLIP_HIT])])

    // One second into the wave: 3 cells.
    await tapAt(w, ANYWHERE, START + 1000)
    expect(hold(w).props('disabled')).toBe(true)

    await holdAt(w, { x: 7, y: 8 })
    expect(hold(w).props('disabled')).toBe(false)

    await confirm(w)
    expect(w.emitted('guess')).toEqual([[{ pins: [{ x: 7, y: 8 }], rings: [[1.5], [], [3]] }]])
  })

  // As in Place Patch: the tip is the player's, so the button wears their colour, its label inked
  // against it.
  it('hands in from a button in my colour', () => {
    const w = mountBoard({ myColorHex: '#fde047' })

    expect(hold(w).props('color')).toBe('#fde047')
    expect(w.get('[data-test="echo-locate-submit-label"]').attributes('style')).toContain(
      'color: #111111',
    )
  })

  describe('while the hand-in hold runs', () => {
    const lock = (w: Board) => w.find('[data-test="echo-locate-lock"]')
    const area = (w: Board) => w.get('[data-test="echo-locate-field"]')

    async function progress(w: Board, value: number) {
      hold(w).vm.$emit('progress', value)
      await nextTick()
    }

    async function ready() {
      saveDraft(storage.fake, KEY, { rings: [[], [], []], pins: [{ x: 3, y: 4 }] })
      const w = mountBoard({ steps: [step(A), step(B), step(C)], draftKey: KEY })
      return w
    }

    // The field greys under „Abgeben …“, so the pins cannot change under a hold about to send them.
    it('greys the field and shows „Abgeben …“ while the ring rises', async () => {
      const w = await ready()
      expect(lock(w).exists()).toBe(false)

      await progress(w, 0.4)
      expect(lock(w).text()).toBe('Abgeben …')

      await progress(w, 0.3)
      expect(lock(w).exists()).toBe(false)
    })

    it('cancels the hold when a finger touches the field, and its tap does nothing', async () => {
      const w = await ready()
      await progress(w, 0.4)

      await area(w).trigger('pointerdown', { pointerId: 2 })
      expect(hold(w).props('disabled')).toBe(true)
      await holdAt(w, { x: 9, y: 9 })
      await area(w).trigger('pointerup', { pointerId: 2 })

      expect(field(w).props('pins')).toEqual([{ x: 3, y: 4 }])
      expect(hold(w).props('disabled')).toBe(false)
    })

    it('drops the lock once handed in', async () => {
      const w = await ready()
      await progress(w, 0.9)

      await confirm(w)
      await progress(w, 1)

      expect(lock(w).exists()).toBe(false)
      expect(w.emitted('guess')).toHaveLength(1)
    })
  })

  it('hands in nothing while disabled', async () => {
    saveDraft(storage.fake, KEY, { rings: [[], [], []], pins: [{ x: 3, y: 4 }] })
    const w = mountBoard({ steps: [step(A), step(B), step(C)], draftKey: KEY, disabled: true })

    await confirm(w)

    expect(hold(w).props('disabled')).toBe(true)
    expect(w.emitted('guess')).toBeUndefined()
  })

  it('ignores clicks while disabled', async () => {
    const w = mountBoard({ disabled: true })

    await tapAt(w, A)
    await holdAt(w, B)

    expect(sound.loadSounds).not.toHaveBeenCalled()
    expect(w.emitted('skip')).toBeUndefined()
    expect(field(w).props('pins')).toEqual([])
  })

  it('saves rings and pins as a draft', async () => {
    const w = mountBoard({ payload: { ...PAYLOAD, pings: 1 }, draftKey: KEY })
    await tapAt(w, A)
    await answer(w, [step(A, [CLIP_HIT])])

    await tapAt(w, ANYWHERE, START + 2000)
    expect(loadDraft(storage.fake, KEY, PAYLOAD)).toEqual({ rings: [[6]], pins: [] })

    await holdAt(w, B)
    expect(loadDraft(storage.fake, KEY, PAYLOAD)).toEqual({ rings: [[6]], pins: [B] })
  })

  it('keeps no draft without a key', async () => {
    const w = mountBoard()
    await tapAt(w, A)

    expect(storage.items.size).toBe(0)
  })

  it('stays silent at a missing clip', async () => {
    const w = mountBoard({ clipSrcs: [null] })
    await tapAt(w, A)

    await answer(w, [step(A, [CLIP_HIT])])

    expect(sound.loadSounds).toHaveBeenCalledWith(sound.ctx, [null])
    expect(engine().ping).toHaveBeenCalledWith([])
    expect(status(w).text()).toBe('Markieren')
  })

  it('picks up a clip that arrives after the start', async () => {
    const w = mountBoard({ clipSrcs: [null] })
    await tapAt(w, A)

    await w.setProps({ clipSrcs: [SRC] })
    await flushPromises()
    await answer(w, [step(A, [CLIP_HIT])])

    expect(sound.engines).toHaveLength(1)
    expect(engine().startBed).toHaveBeenCalledOnce()
    expect(engine().ping).toHaveBeenCalledWith(
      shotsOf([CLIP_HIT], soundsFor([SRC]), PAYLOAD.noiseDb),
    )
  })

  it('stops its sound when it goes', async () => {
    const w = mountBoard()
    await tapAt(w, A)

    w.unmount()

    expect(engine().dispose).toHaveBeenCalledOnce()
  })

  it('starts no sound once gone, though the sounds arrive late', async () => {
    let loaded: (sounds: EchoSounds & { bed: AudioBuffer }) => void = () => undefined
    sound.loadSounds.mockImplementation(() => new Promise((resolve) => (loaded = resolve)))
    const w = mountBoard()
    await tapAt(w, A)

    w.unmount()
    loaded(soundsFor([SRC]))
    await flushPromises()

    expect(sound.engines).toHaveLength(0)
  })

  it('tells in the rules that a wave does not cross the whole field', () => {
    const rules = mountBoard()
      .findAll('li')
      .map((item) => item.text())

    expect(rules[1]).toBe(
      'Eine Welle reicht nicht übers ganze Feld: Was zu weit weg liegt, hörst du bei diesem Ping nicht.',
    )
  })

  it('names the tolerance circle in the award box, never a cell', () => {
    const w = mountBoard({ awardRule: 'ALL_QUALIFYING', awardPoints: 1 })

    expect(w.text()).toContain('Jeder gültige Tipp: 1 Punkt')
    expect(w.text()).toContain('Dein Pin muss im Toleranzkreis um den Spruch liegen.')
    expect(w.text()).not.toContain('Zelle')
  })

  it('speaks of one clip in the singular', () => {
    const w = mountBoard({
      awardRule: 'CLOSEST_ONLY',
      awardPoints: 3,
      payload: { ...PAYLOAD, toleranceRadius: null },
    })
    const rules = w.findAll('li').map((item) => item.text())

    expect(w.text()).toContain('Irgendwo im Nebel steckt ein Spruch. Peil ihn an.')
    expect(rules).toEqual([
      'Ein Ping schickt eine Welle los. Was sie erreicht (Spruch oder Ablenkung), erklingt in dem Moment, in dem sie dort ankommt.',
      'Eine Welle reicht nicht übers ganze Feld: Was zu weit weg liegt, hörst du bei diesem Ping nicht.',
      'Hörst du den Spruch, klick aufs Feld: dort bleibt ein Ring stehen. Dieser Ring ist eine reine Markierung für dich – er fließt nicht in die Bewertung ein.',
      'Ein Pin ist deine Schätzung: Drück lang auf die Stelle, wo du den Spruch vermutest. Noch mal lang drücken nimmt ihn weg.',
      '„Markierungen löschen“ räumt die Ringe ab, die Pins bleiben. Zum Abgeben „Abgeben“ gedrückt halten.',
    ])
    expect(w.text()).toContain(
      'Dein Pin im Toleranzkreis — und von allen, die das schaffen, die kürzeste Zeit.',
    )
  })

  it('speaks of two clips in the plural', () => {
    const two = { ...PAYLOAD, clips: 2 as const }
    const one = mountBoard({ awardRule: 'ALL_QUALIFYING', awardPoints: 1, payload: two })
    const w = mountBoard({
      awardRule: 'CLOSEST_ONLY',
      awardPoints: 3,
      payload: { ...two, toleranceRadius: null },
    })
    const rules = w.findAll('li').map((item) => item.text())

    expect(w.text()).toContain('Irgendwo im Nebel stecken zwei Sprüche. Peil sie an.')
    expect(rules.slice(2)).toEqual([
      'Hörst du einen Spruch, klick aufs Feld: dort bleibt ein Ring stehen, bis zu zwei pro Welle. Diese Ringe sind eine reine Markierung für dich – sie fließen nicht in die Bewertung ein.',
      'Ein Pin ist deine Schätzung: Drück lang auf jede Stelle, wo du einen Spruch vermutest. Noch mal lang drücken nimmt ihn weg.',
      '„Markierungen löschen“ räumt die Ringe ab, die Pins bleiben. Zum Abgeben „Abgeben“ gedrückt halten.',
    ])
    expect(w.text()).toContain(
      'Beide Pins im Toleranzkreis — und von allen, die das schaffen, die kürzeste Zeit.',
    )
    expect(one.text()).not.toContain('kürzeste Zeit')
    expect(one.text()).toContain('Beide Pins müssen im Toleranzkreis um ihren Spruch liegen.')
    expect(w.text()).not.toContain('Später in der Edition')
  })

  it('keeps the status line live for screen readers', () => {
    expect(status(mountBoard()).attributes('aria-live')).toBe('polite')
  })

  describe('long click and „Markierungen löschen“', () => {
    const clear = (w: Board) => w.get<HTMLButtonElement>('[data-test="echo-locate-clear-rings"]')

    it('sets a pin with a long click and pings nothing', async () => {
      const w = mountBoard()

      await holdAt(w, A)

      expect(w.emitted('skip')).toBeUndefined()
      expect(field(w).props('pins')).toEqual([A])
    })

    it('says to lift a pin first when every pin is set, for a while', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const hint = (w: Board) => w.get('[data-test="echo-locate-pin-hint"]')
      const w = mountBoard()
      await holdAt(w, A)

      await holdAt(w, B)

      expect(field(w).props('pins')).toEqual([A])
      expect(hint(w).text()).toBe(
        'Du musst zuerst einen anderen Pin entfernen, um einen neuen zu setzen.',
      )
      expect(hint(w).attributes('aria-live')).toBe('polite')

      vi.advanceTimersByTime(3000)
      await nextTick()
      expect(hint(w).text()).toBe('Lang drücken: Pin setzen oder entfernen')
    })

    it('sets a pin even while a wave runs, which goes on', async () => {
      const w = mountBoard()
      await tapAt(w, A)
      await answer(w, [step(A, [CLIP_HIT])])

      await holdAt(w, B)

      expect(field(w).props('pins')).toEqual([B])
      expect(status(w).text()).toContain('Markieren')
    })

    // As Anspielung's skip beside play: „Abgeben“ centred, the broom right next to it, one middle line.
    it('puts the broom beside „Abgeben“, a round icon button without text', () => {
      const w = mountBoard()
      const row = w.get('[data-test="echo-locate-hand-in-row"]')

      expect(row.find('[data-test="echo-locate-clear-rings"]').exists()).toBe(true)
      expect(row.findComponent(HoldButton).exists()).toBe(true)
      expect(row.classes()).toEqual(
        expect.arrayContaining([
          'grid',
          'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
          'items-center',
        ]),
      )
      expect(clear(w).text()).toBe('')
      expect(clear(w).attributes('aria-label')).toBe('Markierungen löschen')
      expect(clear(w).classes()).toEqual(
        expect.arrayContaining(['rounded-full', 'border-2', 'border-outline']),
      )
      expect(clear(w).element.parentElement!.className).toContain('justify-self-start')
    })

    it('clears the rings only, also in the draft; pins and pings stay', async () => {
      saveDraft(storage.fake, KEY, { rings: [[2.5], [4]], pins: [{ x: 3, y: 4 }] })
      const w = mountBoard({ steps: [step(A), step(B)], draftKey: KEY })
      expect(clear(w).element.disabled).toBe(false)

      await clear(w).trigger('click')

      expect(field(w).props('waves')).toEqual(
        [A, B].map((at) => ({ at, startMs: null, endMs: null })),
      )
      expect(field(w).props('rings')).toEqual([[], []])
      expect(field(w).props('pins')).toEqual([{ x: 3, y: 4 }])
      expect(loadDraft(storage.fake, KEY, PAYLOAD)).toEqual({
        rings: [[], []],
        pins: [{ x: 3, y: 4 }],
      })
      expect(clear(w).element.disabled).toBe(true)
    })
  })
})
