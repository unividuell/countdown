import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, useTemplateRef } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useViewportFill } from '../useViewportFill'

/**
 * happy-dom lays nothing out, so every rect is zero and the element's top has to be stubbed. That
 * is the whole input anyway: what was wrong before was the arithmetic between the element's top
 * edge, the viewport floor and the strip — a stage that simply claimed `100dvh` knew none of them.
 */
function fillAt(top: number, options: { strip: number; min: number }): number | null {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)

  // The ref itself, not its value at render time: the measurement happens on mount, after the
  // first render has already read it.
  let height: Ref<number | null> | null = null
  mount(
    defineComponent({
      setup() {
        const frame = useTemplateRef<HTMLElement>('frame')
        height = useViewportFill(frame, options)
        return () => h('div', { ref: 'frame' })
      },
    }),
  )
  return height!.value
}

describe('useViewportFill', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the strip free below the element', () => {
    window.innerHeight = 800

    // 800 floor − 200 top − 48 strip.
    expect(fillAt(200, { strip: 48, min: 320 })).toBe(552)
  })

  it('overflows rather than collapsing when there is no room left', () => {
    window.innerHeight = 300

    expect(fillAt(200, { strip: 48, min: 320 })).toBe(320)
  })
})
