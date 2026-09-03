import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SpotObjectMiniMap from '../SpotObjectMiniMap.vue'

enableAutoUnmount(afterEach)

function mountMiniMap(props: Partial<InstanceType<typeof SpotObjectMiniMap>['$props']> = {}) {
  return mount(SpotObjectMiniMap, {
    props: { open: false, heading: 0, missed: false, color: '#8e44ad', bounds: null, ...props },
  })
}

/**
 * happy-dom answers every rect with zeroes, and the drag's whole arithmetic is rects — so every
 * clamp would collapse to the same number and the geometry would look correct for any input.
 * Hand out real boxes instead and it becomes ordinary arithmetic.
 */
function box(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/** A 375x700 board with the panel resting 12 from its left edge, 100 down. */
function mountDraggable() {
  const bounds = document.createElement('div')
  vi.spyOn(bounds, 'getBoundingClientRect').mockReturnValue(box(0, 0, 375, 700))
  const w = mountMiniMap({ open: true, bounds })
  vi.spyOn(
    w.get<HTMLElement>('[data-test="spot-mini-panel"]').element,
    'getBoundingClientRect',
  ).mockReturnValue(box(12, 100, 200, 200))
  return w
}

async function dragBy(w: ReturnType<typeof mountDraggable>, dx: number, dy: number): Promise<void> {
  w.get('[data-test="spot-mini-grab"]').element.dispatchEvent(
    new MouseEvent('pointerdown', { clientX: 100, clientY: 200, cancelable: true }),
  )
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + dx, clientY: 200 + dy }))
  window.dispatchEvent(new MouseEvent('pointerup'))
  await nextTick()
}

function transformOf(w: ReturnType<typeof mountDraggable>): string {
  return w.get<HTMLElement>('[data-test="spot-mini-panel"]').element.style.transform
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
  it('moves with the handle, and leaves the map itself to Google', async () => {
    const w = mountDraggable()

    await dragBy(w, 50, 30)

    expect(transformOf(w)).toBe('translate(50px, 30px)')
    // The handle is the only thing that drags the panel: it hangs off the frame rather than
    // sitting on the map, where a drag has to stay Google's own pan.
    expect(w.get('[data-test="spot-mini-grab"]').element.parentElement).toBe(
      w.get('[data-test="spot-mini-panel"]').element,
    )
  })

  /** Google's logo and terms link live along the board's bottom edge and may not be covered. */
  it('stays inside the board and above Google’s band', async () => {
    const w = mountDraggable()

    await dragBy(w, 500, 500)

    expect(transformOf(w)).toBe('translate(151px, 360px)')
  })

  it('stays where it was parked across a close and a reopen', async () => {
    const w = mountDraggable()
    await dragBy(w, 50, 30)

    await w.setProps({ open: false })
    await w.setProps({ open: true })

    expect(transformOf(w)).toBe('translate(50px, 30px)')
  })
})
