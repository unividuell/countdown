import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { AssetKey, RoundAssets } from '@/api/assets'
import type { GameEntry } from '@/games/GameEntry'
import PlacePatchBoard from '@/games/placepatch/PlacePatchBoard.vue'
import PlacePatchGame from '@/games/placepatch/PlacePatchGame.vue'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'
import RevealCover from '@/ui/RevealCover.vue'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

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
  mediaType: 'image/jpeg',
}

/** The pictures' URLs are the same sealed or not; only the keys come with the reveal. */
function assetsWith(keys: Record<string, AssetKey> = {}): RoundAssets {
  return { url: (name) => `/asset/${name}`, key: (name) => keys[name] ?? null }
}

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { x: 7, y: 4 },
  outcome: { correct: true },
  points: 1,
  durationMs: null,
  avatar: { bgColorHex: '#7c3aed' },
  votes: [],
  struck: false,
  adminOverride: null,
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(PlacePatchGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: 'mine',
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      assets: assetsWith(),
      ...over,
    },
  })
}

describe('PlacePatchGame', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => new Response(sealed() as BodyInit))
    vi.stubGlobal('fetch', fetchMock)

    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:picture-${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plays on the board with both pictures opened, when payload and keys come together', async () => {
    const board = mountGame({ assets: assetsWith({ board: OPEN, patch: OPEN }) }).getComponent(
      PlacePatchBoard,
    )
    await flushPromises()

    expect(board.props('boardSrc')).toBe('blob:picture-1')
    expect(board.props('patchSrc')).toBe('blob:picture-2')
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      '/asset/board',
      '/asset/patch',
    ])
  })

  it('fetches the sealed pictures under the cover, but shows none before the keys come', async () => {
    const wrapper = mountGame({
      payload: null,
      sealed: true,
      scene: { cols: 40, rows: 30, size: 10 },
    })
    await flushPromises()
    const board = wrapper.getComponent(PlacePatchBoard)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(board.props('boardSrc')).toBeNull()
    expect(board.props('patchSrc')).toBeNull()
  })

  it('keeps the cover preparing until both sealed pictures are loaded', async () => {
    let arrive!: (r: Response) => void
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/patch')
        ? new Promise<Response>((resolve) => (arrive = resolve))
        : Promise.resolve(new Response(sealed() as BodyInit)),
    )
    const wrapper = mountGame({
      payload: null,
      sealed: true,
      scene: { cols: 40, rows: 30, size: 10 },
    })
    await flushPromises()

    expect(wrapper.getComponent(RevealCover).props('state')).toBe('preparing')

    arrive(new Response(sealed() as BodyInit))
    await flushPromises()

    expect(wrapper.getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('shows board and patch from the opened pictures once the reveal brings the keys', async () => {
    const wrapper = mountGame({
      payload: null,
      sealed: true,
      scene: { cols: 40, rows: 30, size: 10 },
    })
    await flushPromises()
    const fetched = fetchMock.mock.calls.length

    await wrapper.setProps({
      payload: PAYLOAD,
      sealed: false,
      assets: assetsWith({ board: OPEN, patch: OPEN }),
    })
    await flushPromises()

    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual([
      expect.stringMatching(/^blob:/),
      expect.stringMatching(/^blob:/),
    ])
    // Nothing more is loaded once the reveal is in: the bytes were already here.
    expect(fetchMock).toHaveBeenCalledTimes(fetched)
  })

  it('fails the cover when a picture cannot be fetched', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/patch')
        ? new Response(null, { status: 404 })
        : new Response(sealed() as BodyInit),
    )
    const wrapper = mountGame({
      payload: null,
      sealed: true,
      scene: { cols: 40, rows: 30, size: 10 },
    })
    await flushPromises()

    expect(wrapper.getComponent(RevealCover).props('state')).toBe('failed')
  })

  it('shows the submitted tip after a reload', () => {
    const board = mountGame({ myGuess: { x: 7, y: 4 }, disabled: true }).getComponent(
      PlacePatchBoard,
    )

    expect(board.props('submitted')).toEqual({ x: 7, y: 4 })
  })

  it('turns into the reveal once the solution is there', async () => {
    const wrapper = mountGame({
      solution: { x: 7, y: 4 },
      entries: [MINE],
      myGuess: { x: 7, y: 4 },
      assets: assetsWith({ board: OPEN, patch: OPEN }),
    })
    await flushPromises()

    expect(wrapper.findComponent(PlacePatchReveal).exists()).toBe(true)
  })

  it('says the round cannot be shown without assets', () => {
    expect(mountGame({ assets: undefined }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['place-patch']).toBe(PlacePatchGame)
    expect(labGameList).toContainEqual({ id: 'place-patch', title: 'Platzierung' })
  })
})
