import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { AssetKey, RoundAssets } from '@/api/assets'
import { gameEntry, gameProps } from '@/games/__tests__/gameFixtures'
import type { GameProps } from '@/games/GameProps'
import { draftKey, loadDraft, saveDraft } from '@/games/paintratio/draft'
import { addStroke, EMPTY_PAINT } from '@/games/paintratio/paintHistory'
import PaintRatioBoard from '@/games/paintratio/PaintRatioBoard.vue'
import PaintRatioGame from '@/games/paintratio/PaintRatioGame.vue'
import PaintRatioReveal from '@/games/paintratio/PaintRatioReveal.vue'
import { STALE_AFTER_MS } from '@/games/drafts'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

enableAutoUnmount(afterEach)

const PAYLOAD = { width: 1200, height: 900, brushes: [40, 80, 160], tolerance: 0.05 }
const SOLUTION = { targetRatio: 0.4234, tolerance: 0.05 }

const { vectors } = JSON.parse(
  readFileSync('../shared/round-assets/seal-vectors.json', 'utf8'),
) as {
  vectors: { keyHex: string; sealedHex: string }[]
}

const hex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/../g) ?? [], (byte) => parseInt(byte, 16))

const vector = vectors[1]!
const sealed = (): Uint8Array => hex(vector.sealedHex)

const OPEN: AssetKey = {
  key: btoa(String.fromCharCode(...hex(vector.keyHex))),
  mediaType: 'image/png',
}

/** The picture's URL names the round, sealed or not; the key comes with the reveal. */
function assetsWith(round: string, keys: Record<string, AssetKey> = {}): RoundAssets {
  return { url: (name) => `/asset/${name}?round=${round}`, key: (name) => keys[name] ?? null }
}

const TARGET = '/asset/target?round=r1'
const KEY = draftKey({ userId: 'mine', assetUrl: TARGET })

const painted = addStroke(EMPTY_PAINT, { brush: 0, color: '#ff0000', points: [1, 1, 1, 9] })

const stroke = { brush: 0, color: '#ff0000', points: [1, 1, 1, 9] }

const MINE = gameEntry({
  userId: 'mine',
  username: 'Leela',
  guess: { strokes: [stroke] },
  outcome: { ratio: 0.43, difference: 0.0066, withinTolerance: true },
  points: 1,
  avatar: { bgColorHex: '#3049E8' },
})
const FRY = gameEntry({
  userId: 'fry',
  username: 'Fry',
  guess: { strokes: [stroke] },
  outcome: { ratio: 0.5, difference: 0.0766, withinTolerance: false },
  points: 0,
})

function mountGame(over: Partial<GameProps> = {}) {
  return mount(PaintRatioGame, {
    props: gameProps({
      payload: PAYLOAD,
      mineUserId: 'mine',
      entries: [MINE],
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      assets: assetsWith('r1'),
      ...over,
    }),
    global: { stubs: { PaintRatioBoard: true, PaintRatioReveal: true } },
  })
}

describe('PaintRatioGame', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()

    fetchMock = vi.fn().mockImplementation(async () => new Response(sealed() as BodyInit))
    vi.stubGlobal('fetch', fetchMock)

    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:picture-${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('before the solution', () => {
    it('shows the board until the solution arrives', async () => {
      const wrapper = mountGame()

      expect(wrapper.findComponent(PaintRatioBoard).exists()).toBe(true)
      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(false)

      await wrapper.setProps({ solution: SOLUTION })

      expect(wrapper.findComponent(PaintRatioBoard).exists()).toBe(false)
      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(true)
    })

    it('stays on the board for a solution it cannot read', () => {
      const wrapper = mountGame({ solution: { targetRatio: 'x', tolerance: 0.05 } })

      expect(wrapper.findComponent(PaintRatioBoard).exists()).toBe(true)
      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(false)
    })

    it('hands the board the round, my colour and the opened picture', async () => {
      const board = mountGame({
        disabled: true,
        assets: assetsWith('r1', { target: OPEN }),
      }).getComponent(PaintRatioBoard)
      await flushPromises()

      expect(board.props()).toEqual({
        payload: PAYLOAD,
        templateSrc: 'blob:picture-1',
        pictureFailed: false,
        myColorHex: '#3049E8',
        draftKey: KEY,
        disabled: true,
        awardRule: 'ALL_QUALIFYING',
        awardPoints: 1,
      })
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([TARGET])
    })

    it('shows no picture while the key is still to come', async () => {
      const board = mountGame().getComponent(PaintRatioBoard)
      await flushPromises()

      expect(board.props('templateSrc')).toBeNull()
      expect(board.props('pictureFailed')).toBe(false)
    })

    it('tells the board when the picture cannot be loaded', async () => {
      fetchMock.mockImplementation(async () => new Response(null, { status: 404 }))
      const board = mountGame().getComponent(PaintRatioBoard)
      await flushPromises()

      expect(board.props('pictureFailed')).toBe(true)
    })

    it('emits the board`s guess as its own', () => {
      const wrapper = mountGame()
      const guess = { strokes: [stroke] }

      wrapper.getComponent(PaintRatioBoard).vm.$emit('guess', guess)

      expect(wrapper.emitted('guess')).toEqual([[guess]])
    })
  })

  describe('draft', () => {
    it('keys the draft by mineUserId and the target`s address', () => {
      const board = (over: Partial<GameProps>) => mountGame(over).getComponent(PaintRatioBoard)

      expect(board({}).props('draftKey')).toBe(KEY)
      expect(board({ mineUserId: 'fry' }).props('draftKey')).toBe(
        draftKey({ userId: 'fry', assetUrl: TARGET }),
      )
      expect(board({ assets: assetsWith('r2') }).props('draftKey')).toBe(
        draftKey({ userId: 'mine', assetUrl: '/asset/target?round=r2' }),
      )
      expect(KEY).not.toBe(draftKey({ userId: 'mine', assetUrl: '/asset/target?round=r2' }))
    })

    it('has no draft key without a player or without assets', () => {
      const board = (over: Partial<GameProps>) => mountGame(over).getComponent(PaintRatioBoard)

      expect(board({ mineUserId: null }).props('draftKey')).toBeNull()
      expect(board({ assets: undefined }).props('draftKey')).toBeNull()
    })

    it('clears the draft once the solution is there', async () => {
      saveDraft(localStorage, KEY, painted)
      const wrapper = mountGame()
      expect(localStorage.getItem(KEY)).not.toBeNull()

      await wrapper.setProps({ solution: SOLUTION })

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('clears the draft of a round that is already solved on arrival', () => {
      saveDraft(localStorage, KEY, painted)

      mountGame({ solution: SOLUTION })

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('keeps the draft while there is no solution', async () => {
      saveDraft(localStorage, KEY, painted)
      const wrapper = mountGame()

      await wrapper.setProps({ disabled: true })

      expect(loadDraft(localStorage, KEY, 3)).toEqual(painted)
    })

    it('leaves another round`s fresh draft alone when it clears', () => {
      const other = draftKey({ userId: 'mine', assetUrl: '/asset/target?round=r2' })
      saveDraft(localStorage, other, painted)

      mountGame({ solution: SOLUTION })

      expect(localStorage.getItem(other)).not.toBeNull()
    })

    describe('sweeping', () => {
      const old = Date.now() - STALE_AFTER_MS - 60_000
      const key = (userId: string, round: string) =>
        draftKey({ userId, assetUrl: `/asset/target?round=${round}` })

      it('drops my stale drafts of other rounds on mount, not the fresh ones nor others` drafts', () => {
        saveDraft(localStorage, key('mine', 'old'), painted, old)
        saveDraft(localStorage, key('mine', 'fresh'), painted)
        saveDraft(localStorage, key('fry', 'old'), painted, old)
        saveDraft(localStorage, KEY, painted, old)

        mountGame()

        expect(localStorage.getItem(key('mine', 'old'))).toBeNull()
        expect(localStorage.getItem(key('mine', 'fresh'))).not.toBeNull()
        expect(localStorage.getItem(key('fry', 'old'))).not.toBeNull()
        expect(localStorage.getItem(KEY)).not.toBeNull()
      })

      it('waits until the player is known', async () => {
        saveDraft(localStorage, key('mine', 'old'), painted, old)
        const wrapper = mountGame({ mineUserId: null })

        expect(localStorage.getItem(key('mine', 'old'))).not.toBeNull()

        await wrapper.setProps({ mineUserId: 'mine' })

        expect(localStorage.getItem(key('mine', 'old'))).toBeNull()
      })

      it('does not sweep without assets', () => {
        saveDraft(localStorage, key('mine', 'old'), painted, old)

        mountGame({ assets: undefined })

        expect(localStorage.getItem(key('mine', 'old'))).not.toBeNull()
      })
    })
  })

  describe('with the solution', () => {
    it('shows the reveal, also for a closed round without own guess', () => {
      const wrapper = mountGame({
        solution: SOLUTION,
        closed: true,
        myGuess: null,
        entries: [FRY],
        mineUserId: 'mine',
      })

      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(true)
      expect(wrapper.findComponent(PaintRatioBoard).exists()).toBe(false)
    })

    it('hands the reveal the picture, the narrowed solution and the ranked rows', async () => {
      const reveal = mountGame({
        solution: SOLUTION,
        entries: [FRY, MINE],
        awardRule: 'CLOSEST_ONLY',
        assets: assetsWith('r1', { target: OPEN }),
      }).getComponent(PaintRatioReveal)
      await flushPromises()

      expect(reveal.props('payload')).toEqual(PAYLOAD)
      expect(reveal.props('solution')).toEqual(SOLUTION)
      expect(reveal.props('templateSrc')).toBe('blob:picture-1')
      expect(reveal.props('mineUserId')).toBe('mine')
      expect(reveal.props('live')).toBe(true)
      expect(reveal.props('rows').map((row: { userId: string }) => row.userId)).toEqual([
        'mine',
        'fry',
      ])
    })

    it('reads the painting of a row with the payload`s brushes', () => {
      const wild = gameEntry({
        userId: 'wild',
        guess: { strokes: [{ ...stroke, brush: 3 }] },
        outcome: { ratio: 0.2, difference: -0.2, withinTolerance: false },
      })
      const reveal = mountGame({ solution: SOLUTION, entries: [MINE, wild] }).getComponent(
        PaintRatioReveal,
      )

      const strokes = Object.fromEntries(
        reveal
          .props('rows')
          .map((row: { userId: string; strokes: unknown }) => [row.userId, row.strokes]),
      )
      expect(strokes['mine']).toEqual([stroke])
      expect(strokes['wild']).toBeNull()
    })

    it('is not live under a rule that pays everyone who qualifies', () => {
      const reveal = mountGame({ solution: SOLUTION }).getComponent(PaintRatioReveal)

      expect(reveal.props('live')).toBe(false)
    })

    it('plays the beats only when the solution just arrived, not after a reload', async () => {
      const reloaded = mountGame({ solution: SOLUTION })
      expect(reloaded.getComponent(PaintRatioReveal).props('animate')).toBe(false)

      const live = mountGame()
      await live.setProps({ solution: SOLUTION })
      expect(live.getComponent(PaintRatioReveal).props('animate')).toBe(true)
    })

    it('says so when the picture cannot be loaded', async () => {
      fetchMock.mockImplementation(async () => new Response(null, { status: 404 }))
      const wrapper = mountGame({ solution: SOLUTION })
      await flushPromises()

      expect(wrapper.text()).toContain('Das Bild ließ sich nicht laden.')
    })

    it('says nothing while the picture is fine', async () => {
      const wrapper = mountGame({
        solution: SOLUTION,
        assets: assetsWith('r1', { target: OPEN }),
      })
      await flushPromises()

      expect(wrapper.text()).not.toContain('Das Bild ließ sich nicht laden.')
    })
  })

  describe('without a readable payload', () => {
    it('renders nothing playable', () => {
      const wrapper = mountGame({
        payload: { width: 'x', height: 900, brushes: [], tolerance: 0.05 },
      })

      expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
      expect(wrapper.findComponent(PaintRatioBoard).exists()).toBe(false)
      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(false)
    })

    it('shows no reveal either, solution or not', () => {
      const wrapper = mountGame({ payload: null, solution: SOLUTION })

      expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
      expect(wrapper.findComponent(PaintRatioReveal).exists()).toBe(false)
    })
  })

  it('is in the registry and in the lab, after Blockierung', () => {
    const ids = labGameList.map((game) => game.id)

    expect(gameComponents['paint-ratio']).toBe(PaintRatioGame)
    expect(labGameList).toContainEqual({ id: 'paint-ratio', title: 'Anmaßung' })
    expect(ids.indexOf('paint-ratio')).toBe(ids.indexOf('copy-blocks') + 1)
  })
})
