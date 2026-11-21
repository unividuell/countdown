import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MatchScaleFootnotes from '../MatchScaleFootnotes.vue'
import type { Silhouette } from '../types'

const A: Silhouette = {
  name: 'Alpha',
  path: 'M0 0H1000V500H0Z',
  width: 1000,
  height: 500,
  attribution: 'Silhouette: Jemand, CC BY 4.0',
}

function notes(a: Silhouette, b: Silhouette) {
  return mount(MatchScaleFootnotes, { props: { a, b } })
    .findAll('[data-test="match-scale-footnote"]')
    .map((li) => li.text())
}

describe('MatchScaleFootnotes', () => {
  it('writes one note for a credit both share', () => {
    expect(notes(A, { ...A, name: 'Beta' })).toEqual([`¹ ${A.attribution}`])
  })

  it('numbers different credits ¹ and ²', () => {
    expect(notes(A, { ...A, attribution: 'Silhouette: Niemand' })).toEqual([
      `¹ ${A.attribution}`,
      '² Silhouette: Niemand',
    ])
  })

  it('renders nothing without credits', () => {
    const wrapper = mount(MatchScaleFootnotes, {
      props: { a: { ...A, attribution: null }, b: { ...A, attribution: null } },
    })

    expect(wrapper.find('[data-test="match-scale-footnotes"]').exists()).toBe(false)
  })

  it('numbers what a generic name stood for after the credits', () => {
    const measure = { axis: 'height' as const, metres: 0.5, source: 'q' }
    const wrapper = mount(MatchScaleFootnotes, {
      props: {
        a: A,
        b: { ...A, name: 'Beta', attribution: null },
        measureA: measure,
        measureB: { ...measure, subject: 'Beta Mk II' },
      },
    })

    expect(wrapper.findAll('[data-test="match-scale-footnote"]').map((li) => li.text())).toEqual([
      `¹ ${A.attribution}`,
      '² Maß: Beta Mk II',
    ])
  })

  it('closes with the category legend, unnumbered', () => {
    const wrapper = mount(MatchScaleFootnotes, {
      props: { a: A, b: { ...A, attribution: null }, legend: 'Wie gezeichnet.' },
    })
    const bare = mount(MatchScaleFootnotes, {
      props: {
        a: { ...A, attribution: null },
        b: { ...A, attribution: null },
        legend: 'Wie gezeichnet.',
      },
    })

    expect(wrapper.findAll('[data-test="match-scale-footnote"]').map((li) => li.text())).toEqual([
      `¹ ${A.attribution}`,
      'Wie gezeichnet.',
    ])
    expect(bare.findAll('[data-test="match-scale-footnote"]').map((li) => li.text())).toEqual([
      'Wie gezeichnet.',
    ])
  })

  it('numbers a lone credit of B ¹', () => {
    expect(notes({ ...A, attribution: null }, A)).toEqual([`¹ ${A.attribution}`])
  })
})
