import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import SpotObjectMiniMap from '../SpotObjectMiniMap.vue'

enableAutoUnmount(afterEach)

function mountMiniMap(props: Partial<InstanceType<typeof SpotObjectMiniMap>['$props']> = {}) {
  return mount(SpotObjectMiniMap, {
    props: { open: false, heading: 0, missed: false, color: '#8e44ad', ...props },
  })
}

/** happy-dom computes no layout, but `v-show` is a plain inline style and reads back. */
function shown(element: HTMLElement): boolean {
  return element.style.display !== 'none'
}

describe('SpotObjectMiniMap', () => {
  it('stays out of sight until the board opens it', () => {
    const w = mountMiniMap()

    expect(shown(w.get<HTMLElement>('[data-test="spot-mini-panel"]').element)).toBe(false)
  })

  /**
   * The map element outlives every open and close — Google measures a `display:none` element as
   * nothing — so the panel is hidden, never unmounted, and each open hands the same element back.
   */
  it('hands out its map element every time the panel comes on screen', async () => {
    const w = mountMiniMap()
    const stage = w.get<HTMLElement>('[data-test="spot-mini-stage"]').element

    await w.setProps({ open: true })
    await w.setProps({ open: false })
    await w.setProps({ open: true })

    expect(w.emitted('shown')).toHaveLength(2)
    expect(w.emitted('shown')?.[1]?.[0]).toBe(stage)
  })

  /**
   * A press on the map itself moves the player, so both ways out of this size need a control of
   * their own — one down to the icon, one up to the full-screen map.
   */
  it('carries both ways out of its own size', async () => {
    const w = mountMiniMap({ open: true })

    await w.get('[data-test="spot-mini-close"]').trigger('click')
    await w.get('[data-test="spot-mini-full"]').trigger('click')

    expect(w.emitted('collapse')).toHaveLength(1)
    expect(w.emitted('expand')).toHaveLength(1)
  })

  it('turns the view cone with the player', async () => {
    const w = mountMiniMap({ open: true, heading: 90 })

    expect(w.get<HTMLElement>('[data-test="spot-mini-cone"]').element.style.transform).toContain(
      'rotate(90deg)',
    )

    await w.setProps({ heading: 215 })

    expect(w.get<HTMLElement>('[data-test="spot-mini-cone"]').element.style.transform).toContain(
      'rotate(215deg)',
    )
  })

  it('says so when a tap found nothing', async () => {
    const w = mountMiniMap({ open: true })

    expect(w.find('[data-test="spot-mini-missed"]').exists()).toBe(false)

    await w.setProps({ missed: true })

    expect(w.find('[data-test="spot-mini-missed"]').exists()).toBe(true)
  })
})
