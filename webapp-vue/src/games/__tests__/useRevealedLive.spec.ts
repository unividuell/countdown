import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useRevealedLive } from '@/games/useRevealedLive'

/** A reveal card mounted behind `revealed`, recording what `animate` read on each mount. */
function host(revealed: Ref<boolean>): boolean[] {
  const seen: boolean[] = []
  const Card = defineComponent({
    props: { animate: { type: Boolean, required: true } },
    setup(props) {
      seen.push(props.animate)
      return () => h('div')
    },
  })
  const Host = defineComponent({
    setup() {
      const live = useRevealedLive(revealed)
      return () => (revealed.value ? h(Card, { animate: live.value }) : null)
    },
  })

  mount(Host)
  return seen
}

describe('useRevealedLive', () => {
  it('stays false for a round already revealed on mount — a reload replays nothing', () => {
    expect(host(ref(true))).toEqual([false])
  })

  it('is true by the time the reveal card mounts on a live reveal', async () => {
    const revealed = ref(false)
    const seen = host(revealed)

    revealed.value = true
    await nextTick()

    expect(seen).toEqual([true])
  })

  it('stays armed when the same instance reveals again', async () => {
    const revealed = ref(false)
    const seen = host(revealed)

    revealed.value = true
    await nextTick()
    revealed.value = false
    await nextTick()
    revealed.value = true
    await nextTick()

    expect(seen).toEqual([true, true])
  })
})
