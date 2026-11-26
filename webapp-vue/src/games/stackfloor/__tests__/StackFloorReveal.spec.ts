import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import { TIMELINE_TIMERS } from '@/games/__tests__/timelineTiming'
import type { ScoreRow } from '../scoreboard'
import StackFloorReveal from '../StackFloorReveal.vue'
import { buildTower } from '../tower'
import TowerView from '../TowerView.vue'
import { geometryOf } from '../types'
import type { StackFloorPayload } from '../types'

vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: vi.fn() })) }))

const PAYLOAD: StackFloorPayload = {
  fieldWidth: 1000,
  startWidth: 660,
  speedNum: 1,
  speedDen: 2,
  accelPercent: 3,
  perfectTolerance: 3,
  pauseMs: 300,
  maxFloors: 999,
  hueStart: 100,
  target: 3,
}
const MINE = [660, 400]
const THEIRS = [100, 200, 300]

function row(userId: string, clicks: number[] | null, over: Partial<ScoreRow> = {}): ScoreRow {
  return {
    userId,
    name: userId,
    colorHex: '#336699',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    durationLabel: null,
    height: clicks?.length ?? null,
    marks: [],
    clicks,
    ...over,
  } as ScoreRow
}

function mountReveal(rows: ScoreRow[], mineUserId: string | null = 'me') {
  return mount(StackFloorReveal, {
    props: { payload: PAYLOAD, rows, mineUserId, live: false, animate: false },
  })
}

describe('StackFloorReveal', () => {
  it('my tower stands first', () => {
    const view = mountReveal([row('me', MINE), row('them', THEIRS)]).getComponent(TowerView)

    expect(view.props('bars')).toEqual(buildTower(geometryOf(PAYLOAD), MINE).bars)
    expect(view.props('slider')).toBeNull()
    expect(view.props('cuts')).toEqual([])
    expect(view.props('fit')).toBe(true)
    expect(view.props('target')).toBe(3)
  })

  it('tapping another name shows that tower, one at a time', async () => {
    const wrapper = mountReveal([row('me', MINE), row('them', THEIRS)])

    await wrapper.get('[data-test="select-them"]').trigger('click')

    expect(wrapper.findAllComponents(TowerView)).toHaveLength(1)
    expect(wrapper.getComponent(TowerView).props('bars')).toEqual(
      buildTower(geometryOf(PAYLOAD), THEIRS).bars,
    )
  })

  it('the selected name tapped again stays selected', async () => {
    const wrapper = mountReveal([row('me', MINE), row('them', THEIRS)])

    await wrapper.get('[data-test="select-me"]').trigger('click')

    expect(wrapper.getComponent(TowerView).props('bars')).toEqual(
      buildTower(geometryOf(PAYLOAD), MINE).bars,
    )
  })

  it('without a tip of mine the first name is selected', () => {
    const wrapper = mountReveal([row('them', THEIRS), row('other', MINE)], null)

    expect(wrapper.getComponent(TowerView).props('bars')).toEqual(
      buildTower(geometryOf(PAYLOAD), THEIRS).bars,
    )
  })

  it('an unreadable tip can be tapped and says so', async () => {
    const wrapper = mountReveal([row('me', MINE), row('them', null)])

    await wrapper.get('[data-test="select-them"]').trigger('click')

    expect(wrapper.text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
    expect(wrapper.findComponent(TowerView).exists()).toBe(false)
  })

  it('a marked row wears the mark', () => {
    const wrapper = mountReveal([row('me', MINE, { marks: ['RESTARTED'] })])

    expect(wrapper.find('[title="Markiert: neu geladen"]').exists()).toBe(true)
  })

  // The rule every reveal keeps — see `judgesWithVerdict`.
  it('judges with its verdict: my row lands silently, the others after', async () => {
    vi.useFakeTimers({ toFake: [...TIMELINE_TIMERS, 'setInterval', 'clearInterval'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    try {
      await expectJudgesWithVerdict({
        mount: () =>
          mount(StackFloorReveal, {
            props: {
              payload: PAYLOAD,
              rows: [row('me', MINE), row('them', THEIRS)].map((r, tick) => ({ ...r, tick })),
              mineUserId: 'me',
              live: false,
              animate: true,
            },
          }),
        mineUserId: 'me',
        judging: () => false,
        verdict: 'silent',
      })
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
