import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Avatar from '../Avatar.vue'

describe('Avatar', () => {
  // The DOM may hand back an inline colour either as written or normalised to rgb(); assert the
  // colour, not the serialisation.
  const asWritten = (hex: string, rgb: string) => new RegExp(`${hex}|${rgb}`)
  const PURPLE = asWritten('#8e44ad', 'rgb\\(142, 68, 173\\)')

  it('shows the short name on the chosen colour', () => {
    const w = mount(Avatar, { props: { shortName: 'AMY', bgColorHex: '#8e44ad' } })
    expect(w.text()).toBe('AMY')
    expect(w.attributes('style')).toMatch(PURPLE)
  })

  it('picks light text on a dark circle and dark text on a light one', () => {
    const dark = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#111111' } })
    expect(dark.attributes('style')).toMatch(asWritten('#ffffff', 'rgb\\(255, 255, 255\\)'))
    const light = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#eeeeee' } })
    expect(light.attributes('style')).toMatch(asWritten('#111111', 'rgb\\(17, 17, 17\\)'))
  })

  it('carries the outline that belongs to the avatar, not to its surroundings', () => {
    const w = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad' } })
    expect(w.classes()).toContain('ring-2')
    expect(w.classes()).toContain('ring-white')
  })

  it('defaults to the roster size and shrinks on request', () => {
    const lg = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad' } })
    expect(lg.classes()).toContain('size-12')
    expect(lg.classes()).toContain('text-sm')
    const sm = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad', size: 'sm' } })
    expect(sm.classes()).toContain('size-8')
    expect(sm.classes()).not.toContain('size-12')
    expect(sm.classes()).toContain('text-[10px]')
  })

  it('lets the caller attach its own attributes to the circle', () => {
    // MemberRow measures the circle by this attribute during the fly-in; it has to land on the
    // element that *is* the circle, not on a wrapper.
    const w = mount(Avatar, {
      props: { shortName: 'A', bgColorHex: '#8e44ad' },
      attrs: { 'data-swarm-circle': '' },
    })
    expect(w.attributes('data-swarm-circle')).toBeDefined()
    expect(w.classes()).toContain('rounded-full')
  })
})
