import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import SongSnippetBoard from '@/games/songsnippet/SongSnippetBoard.vue'
import type { SongSuggestion } from '@/games/songsnippet/api'

interface PlaybackStub {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: Mock
  restart: Mock
  pause: Mock
  dispose: Mock
}

const { fetchAssetBlob } = vi.hoisted(() => ({ fetchAssetBlob: vi.fn() }))
vi.mock('@/api/assets', () => ({ fetchAssetBlob }))

const { playbacks } = vi.hoisted(() => ({ playbacks: [] as PlaybackStub[] }))
vi.mock('@/games/songsnippet/usePlayback', async () => {
  const { ref } = await import('vue')
  const { vi: vitest } = await import('vitest')
  return {
    usePlayback: () => {
      const stub: PlaybackStub = {
        positionSeconds: ref(0),
        playing: ref(false),
        setSource: vitest.fn(),
        restart: vitest.fn(),
        pause: vitest.fn(),
        dispose: vitest.fn(),
      }
      playbacks.push(stub)
      return stub
    },
  }
})

/** The search box brings its own network and debounce; the board only cares that a pick arrives. */
vi.mock('@/games/songsnippet/SongSearchBox.vue', () => ({
  default: {
    name: 'SongSearchBox',
    props: ['disabled'],
    emits: ['select'],
    template: '<div data-test="search-stub" />',
  },
}))

const DURATIONS = [0.1, 0.5, 2, 8, 15]

const HIT: SongSuggestion = {
  trackId: 426703682,
  artist: 'Eagles',
  title: 'Hotel California',
  coverUrl: null,
}

function mountBoard(props: {
  stage?: number
  awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null
  disabled?: boolean
  notice?: string | null
}) {
  return mount(SongSnippetBoard, {
    props: {
      durations: DURATIONS,
      stage: props.stage ?? 0,
      awardRule: props.awardRule ?? null,
      disabled: props.disabled ?? false,
      assetUrl: (key: number) => `/assets/${key}`,
      notice: props.notice ?? null,
    },
  })
}

describe('SongSnippetBoard', () => {
  beforeEach(() => {
    fetchAssetBlob.mockReset()
    fetchAssetBlob.mockResolvedValue(new Blob(['x']))
    playbacks.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:stage')
    URL.revokeObjectURL = vi.fn()
  })

  it('submits the guess with the pick itself — there is no separate confirm button', async () => {
    const w = mountBoard({})

    await w.findComponent({ name: 'SongSearchBox' }).vm.$emit('select', HIT)

    expect(w.emitted('guess')).toEqual([[HIT]])
  })

  it('skips from the stage it is showing, and cannot skip off the top', () => {
    const w = mountBoard({ stage: 2 })
    w.get('[data-test="skip"]').trigger('click')
    expect(w.emitted('skip')).toEqual([[2]])

    const top = mountBoard({ stage: DURATIONS.length - 1 })
    expect(top.get('[data-test="skip"]').attributes('disabled')).toBeDefined()
  })

  it('warns by outline colour: quiet green while a skip costs only glory, red once it costs more', () => {
    expect(
      mountBoard({ awardRule: 'ALL_QUALIFYING' }).get('[data-test="skip"]').classes(),
    ).toContain('border-emerald-300')
    expect(mountBoard({ awardRule: 'CLOSEST_ONLY' }).get('[data-test="skip"]').classes()).toContain(
      'border-rose-300',
    )
  })

  it('gives up on a single press of an ordinary button', async () => {
    const w = mountBoard({})

    await w.get('[data-test="give-up"]').trigger('click')

    expect(w.emitted('giveUp')).toHaveLength(1)
  })

  it('loads the stage clip on arrival without sounding it', async () => {
    const w = mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenCalledWith('/assets/0')
    expect(playbacks[0]!.setSource).toHaveBeenCalledWith('blob:stage')
    expect(playbacks[0]!.restart).not.toHaveBeenCalled()
    expect(w.get('[data-test="cover-placeholder"]').text()).toBe('?')
  })

  it('plays the longer clip by itself once the stage grows', async () => {
    const w = mountBoard({ stage: 0 })
    await Promise.resolve()
    await Promise.resolve()

    await w.setProps({ stage: 1 })
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchAssetBlob).toHaveBeenLastCalledWith('/assets/1')
    expect(playbacks[0]!.restart).toHaveBeenCalledTimes(1)
  })

  it('keeps the verdict line present so nothing below it moves when a verdict arrives', () => {
    expect(mountBoard({ notice: null }).find('[data-test="song-notice"]').exists()).toBe(true)
    expect(
      mountBoard({ notice: 'Falsch — nächste Stufe frei.' })
        .get('[data-test="song-notice"]')
        .text(),
    ).toBe('Falsch — nächste Stufe frei.')
  })

  it('holds the title slot open so the reveal does not shift the bar', () => {
    const w = mountBoard({})

    const slot = w.get('[data-test="title-slot"]')
    expect(slot.text()).toBe('')
    expect(slot.classes()).toContain('h-6')
  })
})
