import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SpotObjectScoreboard from '../SpotObjectScoreboard.vue'
import { RESULTS_DELAY_MS } from '@/games/revealChoreography'
import type { ScoreRow } from '../tips'

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    durationLabel: null,
    points: 1,
    provisional: false,
    tick: 0,
    ...over,
  }
}

function mountBoard(props: Partial<InstanceType<typeof SpotObjectScoreboard>['$props']> = {}) {
  return mount(SpotObjectScoreboard, {
    props: {
      rows: [row({ userId: 'a' })],
      live: false,
      animate: false,
      ...props,
    },
  })
}

describe('SpotObjectScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows one row per player', () => {
    const wrapper = mountBoard({
      rows: [row({ userId: 'a' }), row({ userId: 'b', points: 0 })],
    })

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('leaves the clock column out of an untimed round', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a' })] })

    expect(wrapper.text()).not.toContain('[mm:ss]')
  })

  it('shows the clock column as soon as a row has a duration', () => {
    const wrapper = mountBoard({ rows: [row({ userId: 'a', durationLabel: '00:42' })] })

    expect(wrapper.text()).toContain('[mm:ss]')
    expect(wrapper.text()).toContain('00:42')
  })

  it('shows a pulsing live chip while the round can still change', () => {
    const wrapper = mountBoard({ live: true })

    const live = wrapper.get('[data-test="spot-scoreboard-live"]')
    expect(live.text()).toContain('live')
    expect(live.classes()).toContain('animate-pulse')
  })

  it('hides the live chip once the round is settled', () => {
    const wrapper = mountBoard({ live: false })

    expect(wrapper.find('[data-test="spot-scoreboard-live"]').exists()).toBe(false)
  })

  it('never puts the pulse on an element the fade is meant to hide', () => {
    const wrapper = mountBoard({
      live: true,
      rows: [row({ userId: 'a', provisional: true, points: 2 })],
    })

    const pulsing = wrapper.findAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
    for (const el of pulsing) {
      expect(el.classes()).not.toContain('transition-opacity')
      expect(el.classes()).not.toContain('opacity-0')
      expect(el.classes()).not.toContain('opacity-100')
    }
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    const wrapper = mountBoard({ animate: false })
    const cells = wrapper.findAll('.transition-opacity')

    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.classes()).toContain('opacity-100')
    }
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const wrapper = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })

    expect(wrapper.get('tbody td').classes()).toContain('opacity-0')
    vi.advanceTimersByTime(50)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('tbody td').classes()).toContain('opacity-100')

    const cells = wrapper.findAll<HTMLElement>('tbody tr:first-child td')
    const delays = cells.map((cell) => cell.element.style.transitionDelay)
    expect(delays[0]).toBe(`${RESULTS_DELAY_MS}ms`)

    const second = wrapper.get<HTMLElement>('tbody tr:nth-child(2) td')
    expect(second.element.style.transitionDelay).toBe(`${RESULTS_DELAY_MS + 120}ms`)
  })
})
