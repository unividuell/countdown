import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import SongSnippetReveal from '@/games/songsnippet/SongSnippetReveal.vue'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import type { SongSnippetSolution } from '@/games/songsnippet/types'
import { TIMELINE_TIMERS, VERDICT_AT_MS } from '@/games/__tests__/timelineTiming'
import { playVerdict } from '@/ui/verdictSound'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

enableAutoUnmount(afterEach)

const SOLUTION: SongSnippetSolution = {
  artist: 'Element of Crime',
  title: 'Delmenhorst',
  coverUrl: null,
  link: 'https://example.invalid/track/1',
}

/**
 * Both children bring their own audio and asset machinery and are tested where they live; this
 * spec is about the reveal's own root and nothing else.
 */
function mountReveal(animate = false, won: boolean | null = null) {
  return mount(SongSnippetReveal, {
    props: {
      solution: SOLUTION,
      durations: [0.1, 0.5, 2, 8, 15],
      rows: [],
      live: false,
      animate,
      won,
    },
    global: { stubs: { SongPlayerReveal: true, SongSnippetScoreboard: true } },
  })
}

describe('SongSnippetReveal', () => {
  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page).
  it('brings no frame of its own', () => {
    const classes = mountReveal().classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-outline')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('is reachable from the game adapter that mounts it', () => {
    expect(mountReveal().attributes('data-test')).toBe('song-reveal')
  })

  it('hands a live reveal on to the player, whose bar morphs on it', () => {
    expect(mountReveal(true).getComponent({ name: 'SongPlayerReveal' }).props('animate')).toBe(true)
    expect(mountReveal().getComponent({ name: 'SongPlayerReveal' }).props('animate')).toBe(false)
  })

  describe('verdict', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
      vi.mocked(playVerdict).mockClear()
      stopVerdict.mockClear()
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('plays mine at the verdict', () => {
      mountReveal(true, false)
      vi.advanceTimersByTime(VERDICT_AT_MS - 50)
      expect(playVerdict).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(false)
    })

    it('plays it at once where nothing moves', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      mountReveal(true, true)
      vi.advanceTimersByTime(0)

      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(true)
    })

    it('stays silent on a reload into a round already revealed', () => {
      mountReveal(false, true)
      vi.advanceTimersByTime(VERDICT_AT_MS)

      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('stays silent without a verdict on a tip of mine', () => {
      mountReveal(true, null)
      vi.advanceTimersByTime(VERDICT_AT_MS)

      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('stays silent in a background tab', () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      mountReveal(true, true)
      vi.advanceTimersByTime(VERDICT_AT_MS)

      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('leaving cuts a verdict that is sounding', () => {
      const w = mountReveal(true, true)
      vi.advanceTimersByTime(VERDICT_AT_MS)
      w.unmount()

      expect(stopVerdict).toHaveBeenCalledOnce()
    })

    // A speaker by the song would read as muting the song.
    it('has no sound toggle', () => {
      expect(mountReveal(true, true).find('button[aria-label="Ton"]').exists()).toBe(false)
    })
  })

  // The rule every reveal keeps — see `judgesWithVerdict`. The table stands in through the shared
  // frame: its own playback is tested where it lives. The title's cover is SongPlayerReveal's.
  it('judges with its verdict: my row lands with its sound', async () => {
    const Table = defineComponent({
      props: { rows: { type: Array as PropType<ScoreboardRow[]>, required: true } },
      setup: (props) => () =>
        h(RevealScoreboard, { rows: props.rows, columns: [], caption: 'Tipps', live: false }),
    })
    const tableRow = (userId: string, tick: number): ScoreboardRow => ({
      userId,
      name: userId,
      colorHex: '#406abf',
      ink: '#ffffff',
      points: 1,
      provisional: false,
      tick,
    })
    vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
    try {
      await expectJudgesWithVerdict({
        mount: () =>
          mount(SongSnippetReveal, {
            props: {
              solution: SOLUTION,
              durations: [0.1, 0.5, 2, 8, 15],
              rows: [tableRow('me', 0), tableRow('them', 1)] as never,
              live: false,
              animate: true,
              won: true,
            },
            global: { stubs: { SongPlayerReveal: true, SongSnippetScoreboard: Table } },
          }),
        mineUserId: 'me',
        judging: () => false,
        verdict: 'sound',
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
