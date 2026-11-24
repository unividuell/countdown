import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import MixPie from '../MixPie.vue'

enableAutoUnmount(afterEach)

const A = { key: 'a', hex: '#111111', dot: '#AA0000' }
const B = { key: 'b', hex: '#222222', dot: '#00AA00' }

const fills = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-test="pie-slice"]').map((slice) => slice.attributes('fill'))

async function settle(w: ReturnType<typeof mount>, ms = 1000) {
  vi.advanceTimersByTime(ms)
  await w.vm.$nextTick()
}

describe('MixPie', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }))
  afterEach(() => vi.useRealTimers())

  it('keeps the given order, whichever slice came on last', async () => {
    const w = mount(MixPie, {
      props: {
        slices: [
          { ...A, on: false },
          { ...B, on: true },
        ],
        start: 23,
      },
    })

    await w.setProps({
      slices: [
        { ...A, on: true },
        { ...B, on: true },
      ],
    })
    await settle(w)

    expect(fills(w)).toEqual(['#111111', '#222222'])
  })

  it('lets a slice switched off shrink before it goes', async () => {
    const w = mount(MixPie, {
      props: {
        slices: [
          { ...A, on: true },
          { ...B, on: true },
        ],
        start: 23,
      },
    })

    await w.setProps({
      slices: [
        { ...A, on: false },
        { ...B, on: true },
      ],
    })
    await settle(w, 100)
    expect(fills(w)).toEqual(['#111111', '#222222'])

    await settle(w)
    expect(fills(w)).toEqual(['#222222'])
  })

  it('a lone slice is the whole circle', () => {
    const w = mount(MixPie, { props: { slices: [{ ...A, on: true }], start: 23 } })

    expect(w.get('[data-test="pie-slice"]').attributes('d')).toBe(
      'M47 0A47 47 0 1 1 -47 0A47 47 0 1 1 47 0Z',
    )
  })
})
