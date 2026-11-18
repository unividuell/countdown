import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PipeGrid from '@/games/turnpipes/PipeGrid.vue'
import { PLATE_URL, tileUrl } from '@/games/turnpipes/tiles'
import { TURN_MS } from '@/games/turnpipes/turns'
import type { PipeKindCode } from '@/games/turnpipes/types'

function kindsOf(size: number): PipeKindCode[] {
  return Array.from({ length: size * size }, () => 'STRAIGHT')
}

function mountGrid(over: Record<string, unknown> = {}) {
  return mount(PipeGrid, {
    props: {
      size: 6,
      kinds: kindsOf(6),
      turns: Array.from({ length: 36 }, () => 0),
      wet: new Set<number>(),
      leakCell: null,
      interactive: true,
      ...over,
    },
  })
}

describe('PipeGrid', () => {
  it('one button per cell, the pipe turned by its turns', () => {
    const turns = Array.from({ length: 36 }, () => 0)
    turns[7] = 5
    const wrapper = mountGrid({ turns })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(36)
    expect(buttons[7]!.get('img:nth-of-type(2)').attributes('style')).toContain('rotate(450deg)')
    expect(buttons[7]!.attributes('aria-label')).toBe('Kachel 8')
  })

  it('the images neither drag nor take the tap', () => {
    const images = mountGrid().findAll('img')

    expect(images.length).toBeGreaterThan(0)
    for (const img of images) {
      expect(img.attributes('draggable')).toBe('false')
      expect(img.classes()).toContain('pointer-events-none')
    }
  })

  it('a tap emits its cell only when interactive', async () => {
    const live = mountGrid()
    await live.findAll('button')[3]!.trigger('click')
    expect(live.emitted('tap')).toEqual([[3]])

    const frozen = mountGrid({ interactive: false })
    await frozen.findAll('button')[3]!.trigger('click')
    expect(frozen.emitted('tap')).toBeUndefined()
  })

  it('wet cells show the wet tile; the leak cell wears the ring', () => {
    const wrapper = mountGrid({ wet: new Set([2]), leakCell: 4 })
    const pipe = (cell: number) => wrapper.findAll('button')[cell]!.findAll('img')[1]!

    expect(pipe(2).attributes('src')).toBe(tileUrl('STRAIGHT', true))
    expect(pipe(3).attributes('src')).toBe(tileUrl('STRAIGHT', false))
    expect(wrapper.findAll('[data-test="pipe-leak"]')).toHaveLength(1)
    expect(wrapper.findAll('button')[4]!.find('[data-test="pipe-leak"]').exists()).toBe(true)
  })

  it('only an interactive grid takes focus', () => {
    expect(mountGrid().attributes('inert')).toBeUndefined()
    expect(mountGrid({ interactive: false }).attributes('inert')).toBe('')
  })

  it('the pipes turn for exactly TURN_MS', () => {
    const pipe = mountGrid().findAll('button')[0]!.findAll('img')[1]!

    expect(pipe.attributes('style')).toContain(`transition-duration: ${TURN_MS}ms`)
  })

  it('sealed shows plates only', () => {
    const images = mountGrid({ kinds: null }).findAll('img')

    expect(images).toHaveLength(36)
    expect(images.every((img) => img.attributes('src') === PLATE_URL)).toBe(true)
  })
})
