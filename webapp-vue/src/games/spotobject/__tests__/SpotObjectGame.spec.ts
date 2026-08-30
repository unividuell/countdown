import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import SpotObjectGame from '../SpotObjectGame.vue'
import type { GameEntry } from '@/games/GameEntry'

// happy-dom has no Google Maps: SpotObjectBoard delegates everything Google to `useStreetView`,
// so this spec only ever sees the composable's public shape, exactly like `SpotObjectBoard.spec.ts`.
vi.mock('../useStreetView', () => ({ useStreetView: vi.fn() }))

import { useStreetView } from '../useStreetView'

function mockStreetView() {
  vi.mocked(useStreetView).mockReturnValue({
    error: ref<string | null>(null),
    mount: vi.fn(),
    pano: reactive({ visible: true, panoId: 'pano-42' }),
    currentTip: () => ({ panoId: 'pano-42', heading: 12, pitch: -3, zoom: 2 }),
    toWorldMap: vi.fn(),
  })
}

const PAYLOAD = { term: 'Roter Briefkasten' }

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { panoId: 'pano-1', heading: 0, pitch: 0, zoom: 1 },
  outcome: { country: 'DE' },
  points: 1,
  durationMs: null,
  avatar: { bgColorHex: '#7c3aed' },
  votes: [],
  struck: false,
  adminOverride: null,
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(SpotObjectGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      awardRule: 'ALL_QUALIFYING',
      disabled: false,
      review: {
        canOverride: false,
        vote: vi.fn().mockResolvedValue(undefined),
        override: vi.fn().mockResolvedValue(undefined),
      },
      ...over,
    },
  })
}

describe('SpotObjectGame', () => {
  it('shows the board while there is no entry of one’s own', () => {
    mockStreetView()
    const wrapper = mountGame()

    expect(wrapper.find('[data-test="spot-map"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tip-grid"]').exists()).toBe(false)
  })

  it('switches to the reveal once the viewer has played', () => {
    mockStreetView()
    const wrapper = mountGame({ entries: [MINE], mineUserId: 'mine' })

    expect(wrapper.find('[data-test="tip-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="spot-map"]').exists()).toBe(false)
  })

  /**
   * The server opens a closed round's payload and everyone's tips to every viewer, played or not.
   * Without this the board would be the face a non-player gets on a finished round: the tips they
   * are entitled to are unreachable, and `RoundHistory` mounts one billed Maps JS load per card.
   */
  it('shows the reveal on a closed round to someone who did not play it', () => {
    mockStreetView()
    const wrapper = mountGame({ entries: [MINE], mineUserId: null, closed: true })

    expect(wrapper.find('[data-test="tip-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="spot-map"]').exists()).toBe(false)
  })

  /**
   * Searching and judging are the same round, so the term has to read the same in both faces and
   * in the same place — otherwise a reviewer re-reads it against a different frame than the
   * player searched under.
   */
  it('carries the term above the board and above the reveal alike', () => {
    mockStreetView()

    const playing = mountGame()
    expect(playing.get('[data-test="spot-term"]').text()).toContain('Roter Briefkasten')

    const reviewing = mountGame({ entries: [MINE], mineUserId: 'mine' })
    expect(reviewing.get('[data-test="spot-term"]').text()).toContain('Roter Briefkasten')
  })

  it('emits the tip the board produced', async () => {
    mockStreetView()
    const wrapper = mountGame()

    await wrapper.get('[data-test="spot-guess-button"]').trigger('click')

    expect(wrapper.emitted('guess')).toEqual([
      [{ panoId: 'pano-42', heading: 12, pitch: -3, zoom: 2 }],
    ])
  })

  it('says so for a payload it cannot read', () => {
    mockStreetView()
    const wrapper = mountGame({ payload: { nonsense: true } })

    expect(wrapper.find('[data-test="spot-map"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tip-grid"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('lässt sich hier nicht anzeigen')
  })
})
