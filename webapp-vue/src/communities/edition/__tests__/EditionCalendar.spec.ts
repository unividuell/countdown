import { mount } from '@vue/test-utils'
import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import EditionCalendar from '../EditionCalendar.vue'
import { editionCells } from '../editionGrid'

const cells = editionCells(
  {
    startsAt: '2026-12-20T17:00:00Z',
    zone: 'Europe/Berlin',
    gamesFromRound: -30,
    gamesUntilRound: 0,
    phaseTwoStartRound: -7,
  },
  DateTime.fromISO('2026-11-05T11:00:00Z'),
)

const mountCalendar = () => mount(EditionCalendar, { props: { cells } })

describe('EditionCalendar', () => {
  it('lays the days out in seven rows, padded up to Monday', () => {
    const grid = mountCalendar().get('[data-test="edition-grid"]')
    const children = grid.element.children

    // 2026-11-04 is a Wednesday: Monday and Tuesday are padding.
    expect(children[0]!.getAttribute('data-test')).toBe('edition-pad')
    expect(children[1]!.getAttribute('data-test')).toBe('edition-pad')
    expect(children[2]!.getAttribute('data-round')).toBe('-45')
    expect(children.length % 7).toBe(0)
    expect(grid.attributes('style')).toContain('repeat(7')
  })

  it('names the month above its first column', () => {
    const months = mountCalendar()
      .findAll('[data-test="edition-month"]')
      .map((m) => m.text())

    expect(months).toEqual(['Nov.', 'Dez.'])
  })

  it('shows one month label per column, the later month winning', () => {
    // 2026-10-29 is a Thursday; Sun 1 Nov falls into the same week column.
    const shared = editionCells(
      {
        startsAt: '2026-12-20T17:00:00Z',
        zone: 'Europe/Berlin',
        gamesFromRound: -30,
        gamesUntilRound: 0,
        phaseTwoStartRound: -7,
      },
      DateTime.fromISO('2026-10-29T11:00:00Z'),
    )
    const months = mount(EditionCalendar, { props: { cells: shared } }).findAll(
      '[data-test="edition-month"]',
    )

    expect(months.map((m) => m.text())).toEqual(['Nov.', 'Dez.'])
  })

  it('always shows the full legend', () => {
    const legend = mountCalendar()
      .findAll('[data-test="edition-legend"] li')
      .map((li) => li.text())

    expect(legend).toEqual(['kein Spiel', 'Phase 1', 'Phase 2', 'Start', 'heute', 'ab hier fix'])
  })

  it('shows the detail line of a tapped cell', async () => {
    const wrapper = mountCalendar()

    await wrapper.get('[data-round="-7"]').trigger('click')

    expect(wrapper.get('[data-test="edition-detail"]').text()).toBe(
      'Runde -7 · Sa., 12. Dez. 18:00 · Phase 2',
    )
  })

  it('keeps the detail line current when the cells change', async () => {
    const wrapper = mountCalendar()
    await wrapper.get('[data-round="-7"]').trigger('click')

    const moved = editionCells(
      {
        startsAt: '2026-12-20T17:00:00Z',
        zone: 'Europe/Berlin',
        gamesFromRound: -30,
        gamesUntilRound: 0,
        phaseTwoStartRound: -3,
      },
      DateTime.fromISO('2026-11-05T11:00:00Z'),
    )
    await wrapper.setProps({ cells: moved })

    expect(wrapper.get('[data-test="edition-detail"]').text()).toBe(
      'Runde -7 · Sa., 12. Dez. 18:00 · Phase 1',
    )
  })

  it('clears the detail line when the selected round is gone', async () => {
    const wrapper = mountCalendar()
    await wrapper.get('[data-round="-45"]').trigger('click')

    await wrapper.setProps({ cells: cells.filter((c) => c.round !== -45) })

    expect(wrapper.get('[data-test="edition-detail"]').text()).toBe('')
  })

  it('scrolls the grid inside its own container', () => {
    expect(mountCalendar().get('[data-test="edition-scroll"]').classes()).toContain(
      'overflow-x-auto',
    )
  })

  it('leaves room for the today ring, which the scroll container would clip', () => {
    // ring-2 + ring-offset-1 = 3px outside the cell; p-1 gives 4px.
    expect(mountCalendar().get('[data-test="edition-scroll"]').classes()).toContain('p-1')
  })
})
