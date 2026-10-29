import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { AssetKey, RoundAssets } from '@/api/assets'
import type { StepView } from '@/api/types'
import { gameEntry, gameProps } from '@/games/__tests__/gameFixtures'
import { STALE_AFTER_MS } from '@/games/drafts'
import { draftKey, loadDraft, saveDraft } from '@/games/echolocate/draft'
import EchoLocateBoard from '@/games/echolocate/EchoLocateBoard.vue'
import EchoLocateGame from '@/games/echolocate/EchoLocateGame.vue'
import EchoLocateReveal from '@/games/echolocate/EchoLocateReveal.vue'
import type { EchoLocatePayload } from '@/games/echolocate/types'
import type { GameProps } from '@/games/GameProps'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

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
const TWO: EchoLocatePayload = { ...PAYLOAD, clips: 2 }

const SOLUTION = {
  targets: [{ col: 5, row: 7 }],
  noises: [{ cell: { col: 1, row: 1 }, kind: 'BIRDS' }],
  toleranceCells: 1,
}

const { vectors } = JSON.parse(
  readFileSync('../shared/round-assets/seal-vectors.json', 'utf8'),
) as {
  vectors: { keyHex: string; sealedHex: string }[]
}

const hex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/../g) ?? [], (byte) => parseInt(byte, 16))

const vector = vectors[1]!
const sealed = (): Uint8Array => hex(vector.sealedHex)

/** The same bytes under two media types, so a spec can tell which clip became which address. */
const open = (mediaType: string): AssetKey => ({
  key: btoa(String.fromCharCode(...hex(vector.keyHex))),
  mediaType,
})
const KEYS = { 'clip-0': open('audio/zero'), 'clip-1': open('audio/one') }

/** A clip's URL names the round, sealed or not; the key comes with the open round. */
function assetsWith(round: string, keys: Record<string, AssetKey> = {}): RoundAssets {
  return { url: (name) => `/asset/${name}?round=${round}`, key: (name) => keys[name] ?? null }
}

const CLIP_0 = '/asset/clip-0?round=r1'
const CLIP_1 = '/asset/clip-1?round=r1'
const KEY = draftKey({ userId: 'mine', assetUrl: CLIP_0 })

const DRAFT = { rings: [[3]], pins: [{ x: 4, y: 5 }] }

const GUESS = { pins: [{ x: 5.4, y: 7.2 }], rings: [[3]] }
const PINGS = [
  { x: 3, y: 4 },
  { x: 9, y: 10 },
]

const MINE = gameEntry({
  userId: 'mine',
  username: 'Leela',
  guess: GUESS,
  outcome: { distance: 0.8, withinTolerance: true, pinOf: [0] },
  points: 1,
  steps: PINGS,
})
const FRY = gameEntry({
  userId: 'fry',
  username: 'Fry',
  guess: GUESS,
  outcome: { distance: 4.2, withinTolerance: false, pinOf: [0] },
  points: 0,
  steps: PINGS,
})

function mountGame(over: Partial<GameProps> = {}) {
  return mount(EchoLocateGame, {
    props: gameProps({
      payload: PAYLOAD,
      mineUserId: 'mine',
      entries: [MINE],
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      assets: assetsWith('r1'),
      ...over,
    }),
    global: { stubs: { EchoLocateBoard: true, EchoLocateReveal: true } },
  })
}

describe('EchoLocateGame', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()

    fetchMock = vi.fn().mockImplementation(async () => new Response(sealed() as BodyInit))
    vi.stubGlobal('fetch', fetchMock)

    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('before the solution', () => {
    it('shows the board until the solution arrives', async () => {
      const wrapper = mountGame()

      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(true)
      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(false)

      await wrapper.setProps({ solution: SOLUTION })

      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(false)
      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(true)
    })

    it('stays on the board for a solution it cannot read', () => {
      const wrapper = mountGame({ solution: { targets: [], noises: [], toleranceCells: 1 } })

      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(true)
      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(false)
    })

    it('hands the board the round, my steps, the opened clip and the draft key', async () => {
      const steps: StepView[] = [{ input: PINGS[0], answer: { hits: [] } }]
      const board = mountGame({
        disabled: true,
        steps,
        assets: assetsWith('r1', KEYS),
      }).getComponent(EchoLocateBoard)
      await flushPromises()

      expect(board.props()).toEqual({
        payload: PAYLOAD,
        steps,
        clipSrcs: ['blob:audio/zero'],
        draftKey: KEY,
        disabled: true,
        awardRule: 'ALL_QUALIFYING',
        awardPoints: 1,
      })
    })

    it('hands the board no steps when the host has none', () => {
      const board = mountGame().getComponent(EchoLocateBoard)

      expect(board.props('steps')).toEqual([])
    })

    it('emits the board`s guess and skip as its own', () => {
      const wrapper = mountGame()
      const board = wrapper.getComponent(EchoLocateBoard)

      board.vm.$emit('guess', GUESS)
      board.vm.$emit('skip', 1, PINGS[1])

      expect(wrapper.emitted('guess')).toEqual([[GUESS]])
      expect(wrapper.emitted('skip')).toEqual([[1, PINGS[1]]])
    })
  })

  describe('the clips', () => {
    it('opens clip-1 only for two clips', async () => {
      mountGame({ assets: assetsWith('r1', KEYS) })
      await flushPromises()

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([CLIP_0])

      fetchMock.mockClear()
      const board = mountGame({ payload: TWO, assets: assetsWith('r1', KEYS) }).getComponent(
        EchoLocateBoard,
      )
      await flushPromises()

      expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([CLIP_0, CLIP_1])
      expect(board.props('clipSrcs')).toEqual(['blob:audio/zero', 'blob:audio/one'])
    })

    it('fetches nothing for a payload it cannot read', async () => {
      mountGame({ payload: { ...TWO, grid: 'x' }, assets: assetsWith('r1', KEYS) })
      mountGame({ payload: null, assets: assetsWith('r1', KEYS) })
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    // The reveal plays no clip: a history card, or a reload into a solved round, needs no bytes.
    it('fetches nothing for a round that is solved on arrival', async () => {
      mountGame({ solution: SOLUTION, assets: assetsWith('r1', KEYS) })
      mountGame({ payload: TWO, solution: SOLUTION, assets: assetsWith('r1', KEYS) })
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('lets go of the clips when the solution arrives, and the reveal renders', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const wrapper = mountGame({ payload: TWO, assets: assetsWith('r1', KEYS) })
      await flushPromises()
      expect(wrapper.getComponent(EchoLocateBoard).props('clipSrcs')).toEqual([
        'blob:audio/zero',
        'blob:audio/one',
      ])
      fetchMock.mockClear()

      await wrapper.setProps({ solution: SOLUTION })
      await flushPromises()

      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(true)
      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(false)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio/zero')
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio/one')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })

    it('crosses from the real board to the real reveal without a warning', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const wrapper = mount(EchoLocateGame, {
        props: gameProps({
          payload: PAYLOAD,
          mineUserId: 'mine',
          entries: [MINE],
          awardRule: 'ALL_QUALIFYING',
          awardPoints: 1,
          assets: assetsWith('r1', KEYS),
        }),
      })
      await flushPromises()
      expect(wrapper.find('[data-test="echo-locate-board"]').exists()).toBe(true)

      await wrapper.setProps({ solution: SOLUTION })
      await flushPromises()

      expect(wrapper.find('[data-test="echo-locate-board"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="echo-locate-reveal"]').exists()).toBe(true)
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })

    it('asks for the clips again when the round goes back to unsolved', async () => {
      const wrapper = mountGame({ solution: SOLUTION, assets: assetsWith('r1', KEYS) })
      await flushPromises()
      expect(fetchMock).not.toHaveBeenCalled()

      await wrapper.setProps({ solution: null })
      await flushPromises()

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([CLIP_0])
      expect(wrapper.getComponent(EchoLocateBoard).props('clipSrcs')).toEqual(['blob:audio/zero'])
    })

    it('gives the board no clip while the key is still to come', async () => {
      const board = mountGame().getComponent(EchoLocateBoard)
      await flushPromises()

      expect(board.props('clipSrcs')).toEqual([null])
    })

    it('plays on when a clip asset fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      fetchMock.mockImplementation(async () => new Response(null, { status: 404 }))
      const wrapper = mountGame({ assets: assetsWith('r1', KEYS) })
      await flushPromises()

      const board = wrapper.getComponent(EchoLocateBoard)
      expect(board.props('clipSrcs')).toEqual([null])
      expect(wrapper.text()).not.toContain('Diese Runde lässt sich hier nicht anzeigen.')
      expect(error).not.toHaveBeenCalled()
    })

    it('keeps the clip that opened when the other one fails', async () => {
      fetchMock.mockImplementation(async (url: string) =>
        url === CLIP_1 ? new Response(null, { status: 404 }) : new Response(sealed() as BodyInit),
      )
      const board = mountGame({ payload: TWO, assets: assetsWith('r1', KEYS) }).getComponent(
        EchoLocateBoard,
      )
      await flushPromises()

      expect(board.props('clipSrcs')).toEqual(['blob:audio/zero', null])
    })

    it('has no clip without assets, and still plays', async () => {
      const board = mountGame({ assets: undefined }).getComponent(EchoLocateBoard)
      await flushPromises()

      expect(board.props('clipSrcs')).toEqual([null])
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('draft', () => {
    it('keys the draft by mineUserId and clip-0`s address', () => {
      const board = (over: Partial<GameProps>) => mountGame(over).getComponent(EchoLocateBoard)

      expect(board({}).props('draftKey')).toBe(KEY)
      expect(board({ mineUserId: 'fry' }).props('draftKey')).toBe(
        draftKey({ userId: 'fry', assetUrl: CLIP_0 }),
      )
      expect(board({ assets: assetsWith('r2') }).props('draftKey')).toBe(
        draftKey({ userId: 'mine', assetUrl: '/asset/clip-0?round=r2' }),
      )
      expect(KEY).not.toBe(draftKey({ userId: 'mine', assetUrl: '/asset/clip-0?round=r2' }))
    })

    it('has the draft key at mount, whether or not the clip has loaded', () => {
      expect(mountGame().getComponent(EchoLocateBoard).props('draftKey')).toBe(KEY)
    })

    it('has no draft key without a player or without assets', () => {
      const board = (over: Partial<GameProps>) => mountGame(over).getComponent(EchoLocateBoard)

      expect(board({ mineUserId: null }).props('draftKey')).toBeNull()
      expect(board({ assets: undefined }).props('draftKey')).toBeNull()
    })

    it('clears the draft once the solution is there', async () => {
      saveDraft(localStorage, KEY, DRAFT)
      const wrapper = mountGame()
      expect(localStorage.getItem(KEY)).not.toBeNull()

      await wrapper.setProps({ solution: SOLUTION })

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('clears the draft of a round that is already solved on arrival', () => {
      saveDraft(localStorage, KEY, DRAFT)

      mountGame({ solution: SOLUTION })

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('keeps the draft while there is no solution', async () => {
      saveDraft(localStorage, KEY, DRAFT)
      const wrapper = mountGame()

      await wrapper.setProps({ disabled: true })

      expect(loadDraft(localStorage, KEY, PAYLOAD)).toEqual(DRAFT)
    })

    it('leaves another round`s fresh draft alone when it clears', () => {
      const other = draftKey({ userId: 'mine', assetUrl: '/asset/clip-0?round=r2' })
      saveDraft(localStorage, other, DRAFT)

      mountGame({ solution: SOLUTION })

      expect(localStorage.getItem(other)).not.toBeNull()
    })

    describe('sweeping', () => {
      const old = Date.now() - STALE_AFTER_MS - 60_000
      const key = (userId: string, round: string) =>
        draftKey({ userId, assetUrl: `/asset/clip-0?round=${round}` })

      it('drops my stale drafts of other rounds on mount, not the fresh ones nor others` drafts', () => {
        saveDraft(localStorage, key('mine', 'old'), DRAFT, old)
        saveDraft(localStorage, key('mine', 'fresh'), DRAFT)
        saveDraft(localStorage, key('fry', 'old'), DRAFT, old)
        saveDraft(localStorage, KEY, DRAFT, old)

        mountGame()

        expect(localStorage.getItem(key('mine', 'old'))).toBeNull()
        expect(localStorage.getItem(key('mine', 'fresh'))).not.toBeNull()
        expect(localStorage.getItem(key('fry', 'old'))).not.toBeNull()
        expect(localStorage.getItem(KEY)).not.toBeNull()
      })

      it('waits until the player is known', async () => {
        saveDraft(localStorage, key('mine', 'old'), DRAFT, old)
        const wrapper = mountGame({ mineUserId: null })

        expect(localStorage.getItem(key('mine', 'old'))).not.toBeNull()

        await wrapper.setProps({ mineUserId: 'mine' })

        expect(localStorage.getItem(key('mine', 'old'))).toBeNull()
      })

      it('does not sweep without assets', () => {
        saveDraft(localStorage, key('mine', 'old'), DRAFT, old)

        mountGame({ assets: undefined })

        expect(localStorage.getItem(key('mine', 'old'))).not.toBeNull()
      })
    })
  })

  describe('with the solution', () => {
    it('shows the reveal once there is a solution, also for a closed round without own guess', () => {
      const wrapper = mountGame({
        solution: SOLUTION,
        closed: true,
        myGuess: null,
        entries: [FRY],
        mineUserId: 'mine',
      })

      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(true)
      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(false)
    })

    it('hands the reveal the round, the narrowed solution and the ranked rows', () => {
      const reveal = mountGame({
        solution: SOLUTION,
        entries: [FRY, MINE],
        awardRule: 'CLOSEST_ONLY',
      }).getComponent(EchoLocateReveal)

      expect(reveal.props('payload')).toEqual(PAYLOAD)
      expect(reveal.props('solution')).toEqual(SOLUTION)
      expect(reveal.props('mineUserId')).toBe('mine')
      expect(reveal.props('live')).toBe(true)
      expect(reveal.props('rows').map((row: { userId: string }) => row.userId)).toEqual([
        'mine',
        'fry',
      ])
    })

    it('reads each row against the payload: my pings, my pins, my distance', () => {
      const reveal = mountGame({ solution: SOLUTION }).getComponent(EchoLocateReveal)

      expect(reveal.props('rows')[0]).toMatchObject({
        userId: 'mine',
        distanceLabel: '0,8',
        guess: GUESS,
        pings: PINGS,
        pinOf: [0],
      })
    })

    it('is not live under a rule that pays everyone who qualifies', () => {
      const reveal = mountGame({ solution: SOLUTION }).getComponent(EchoLocateReveal)

      expect(reveal.props('live')).toBe(false)
    })

    it('plays the beats only when the solution just arrived, not after a reload', async () => {
      const reloaded = mountGame({ solution: SOLUTION })
      expect(reloaded.getComponent(EchoLocateReveal).props('animate')).toBe(false)

      const live = mountGame()
      await live.setProps({ solution: SOLUTION })
      expect(live.getComponent(EchoLocateReveal).props('animate')).toBe(true)
    })
  })

  describe('without a readable payload', () => {
    it('renders nothing playable', () => {
      const wrapper = mountGame({ payload: { ...PAYLOAD, grid: 'x' } })

      expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
      expect(wrapper.findComponent(EchoLocateBoard).exists()).toBe(false)
      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(false)
    })

    it('shows no reveal either, solution or not', () => {
      const wrapper = mountGame({ payload: null, solution: SOLUTION })

      expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
      expect(wrapper.findComponent(EchoLocateReveal).exists()).toBe(false)
    })
  })

  it('is registered for rounds and the lab, after Anmaßung', () => {
    const ids = labGameList.map((game) => game.id)

    expect(gameComponents['echo-locate']).toBe(EchoLocateGame)
    expect(labGameList).toContainEqual({ id: 'echo-locate', title: 'Peilung' })
    expect(ids.indexOf('echo-locate')).toBe(ids.indexOf('paint-ratio') + 1)
  })
})
